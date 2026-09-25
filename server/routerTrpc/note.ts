
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { db } from '../db';
import { helper, TagTreeNode } from '@shared/lib/helper';
import { _ } from '@shared/lib/lodash';
import { NoteType } from '../../shared/lib/types';
import { attachmentsSchema, historySchema, notesSchema, tagSchema, tagsToNoteSchema, commentsSchema } from '@shared/lib/recordSchemas';
import { getGlobalConfig } from './config';
import { FileService } from '../lib/files';
import { AiService } from '@server/aiServer';
import { SendWebhook } from '@server/lib/helper';
import { Context } from '../context';
import { cache } from '@shared/lib/cache';
import { AiModelFactory } from '@server/aiServer/aiModelFactory';
import { authProcedure, demoAuthMiddleware, publicProcedure, router } from '@server/middleware';

/**
 * Snapshot retention for note history.
 *
 * A history row is written on every save that changes content (see the upsert handler below),
 * so without a bound the table grows with ordinary typing. Keep the newest
 * NOTE_HISTORY_RETENTION versions per note and drop the older ones.
 *
 * Pruning cannot strand a user: restoring an old version goes through the same upsert path,
 * which snapshots the current content first, so the pre-restore state stays recoverable.
 */
const NOTE_HISTORY_RETENTION = 50;

async function pruneNoteHistory(noteId: number): Promise<void> {
  const stale = await db.noteHistory.findMany({
    where: { noteId },
    orderBy: { version: 'desc' },
    skip: NOTE_HISTORY_RETENTION,
    select: { id: true },
  });

  if (stale.length === 0) return;

  await db.noteHistory.deleteMany({ where: { id: { in: stale.map(row => row.id) } } });
}

const extractHashtags = (input: string): string[] => {
  const withoutCodeBlocks = input.replace(/```[\s\S]*?```/g, '');
  const hashtagRegex = /(?<!:\/\/)(?<=\s|^)#[^\s#]+(?=\s|$)/g;
  const matches = withoutCodeBlocks.match(hashtagRegex);
  return matches ? matches : [];
};

export const noteRouter = router({
  list: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/list', summary: 'Query notes list', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        tagId: z.union([z.number(), z.null()]).default(null),
        page: z.number().default(1),
        size: z.number().default(30),
        orderBy: z.enum(['asc', 'desc']).default('desc'),
        type: z.union([z.nativeEnum(NoteType), z.literal(-1)]).default(-1),
        isArchived: z.union([z.boolean(), z.null()]).default(false).optional(),
        isShare: z.union([z.boolean(), z.null()]).default(null).optional(),
        isRecycle: z.boolean().default(false).optional(),
        searchText: z.string().default('').optional(),
        withoutTag: z.boolean().default(false).optional(),
        withFile: z.boolean().default(false).optional(),
        withLink: z.boolean().default(false).optional(),
        isUseAiQuery: z.boolean().default(false).optional(),
        startDate: z.union([z.date(), z.null(), z.string()]).default(null).optional(),
        endDate: z.union([z.date(), z.null(), z.string()]).default(null).optional(),
        hasTodo: z.boolean().default(false).optional(),
      }),
    )
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            tags: z.array(
              tagsToNoteSchema.merge(
                z.object({
                  tag: tagSchema,
                }),
              ),
            ),
            references: z
              .array(
                z.object({
                  toNoteId: z.number(),
                  toNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            referencedBy: z
              .array(
                z.object({
                  fromNoteId: z.number(),
                  fromNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            comments: z.any().optional(),
            _count: z.object({
              comments: z.number(),
              histories: z.number(),
            }),
            owner: z.object({
              id: z.number(),
              name: z.string(),
              nickname: z.string(),
              image: z.string(),
            }).nullable().optional(),
            isSharedNote: z.boolean().optional(),
            canEdit: z.boolean().optional(),
            isInternalShared: z.boolean().optional(),
          }),
        ),
      ),
    )
    .mutation(async function ({ input, ctx }) {
      const { tagId, type, isArchived, isRecycle, searchText, page, size, orderBy, withFile, withoutTag, withLink, isUseAiQuery, startDate, endDate, isShare, hasTodo } = input;
      if (isUseAiQuery && searchText?.trim() != '') {
        const cleanedQuery = searchText?.replace(/@/g, '').trim();
        if (cleanedQuery && cleanedQuery.length > 0) {
          if (page == 1) {
            return await AiService.enhanceQuery({ query: cleanedQuery, ctx });
          } else {
            return [];
          }
        }
        return [];
      }

      let where: any = {
        OR: [
          { accountId: Number(ctx.id) },
          { internalShares: { some: { accountId: Number(ctx.id) } } }
        ],
        isRecycle: isRecycle
      };

      if (searchText != '') {
        where = {
          OR: [
            {
              accountId: Number(ctx.id),
              content: { contains: searchText, mode: 'insensitive' }
            },
            {
              accountId: Number(ctx.id),
              attachments: { some: { path: { contains: searchText, mode: 'insensitive' } } }
            },
            {
              internalShares: { some: { accountId: Number(ctx.id) } },
              content: { contains: searchText, mode: 'insensitive' }
            },
            {
              internalShares: { some: { accountId: Number(ctx.id) } },
              attachments: { some: { path: { contains: searchText, mode: 'insensitive' } } }
            }
          ],
        };
        where.isRecycle = isRecycle;
        if (!isRecycle && isArchived != null) {
          where.isArchived = isArchived;
        }
        if (type != -1) {
          where.type = type;
        }
      } else {
        where.isRecycle = isRecycle;
        if (!isRecycle && isArchived != null) {
          where.isArchived = isArchived;
        }
        if (type != -1) {
          where.type = type;
        }
        if (isShare != null) {
          where.isShare = isShare;
        }
      }

      if (tagId) {
        const tags = await db.tagsToNote.findMany({ where: { tagId } });
        where.id = { in: tags?.map((i) => i.noteId) };
      }
      if (withFile) {
        where.attachments = { some: {} };
      }
      if (withoutTag) {
        where.tags = { none: {} };
      }
      if (startDate && endDate) {
        where.createdAt = { gte: startDate, lte: endDate };
      }
      if (withLink) {
        where.OR = [{ content: { contains: 'http://', mode: 'insensitive' } }, { content: { contains: 'https://', mode: 'insensitive' } }];
      }
      if (hasTodo) {
        where.OR = [
          { content: { contains: '- [ ]', mode: 'insensitive' } },
          { content: { contains: '- [x]', mode: 'insensitive' } },
          { content: { contains: '* [ ]', mode: 'insensitive' } },
          { content: { contains: '* [x]', mode: 'insensitive' } },
        ];
      }
      const config = await getGlobalConfig({ ctx });
      let timeOrderBy = config?.isOrderByCreateTime ? { createdAt: orderBy } : { updatedAt: orderBy };

      const notes = await db.notes.findMany({
        where,
        orderBy: [{ isTop: 'desc' }, { sortOrder: 'asc' }, timeOrderBy],
        skip: (page - 1) * size,
        take: size,
        include: {
          tags: { include: { tag: true } },
          attachments: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
          comments: {
            include: {
              account: {
                select: {
                  image: true,
                  nickname: true,
                  name: true,
                },
              },
            },
          },
          references: {
            select: {
              toNoteId: true,
              toNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          referencedBy: {
            select: {
              fromNoteId: true,
              fromNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          _count: {
            select: {
              comments: true,
              histories: true,
            },
          },
          internalShares: true,
        },
      });

      return notes.map((note) => ({
        ...note,
        isInternalShared: note.internalShares.length > 0,
      }));
    }),
  publicList: publicProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/v1/note/public-list',
        summary: 'Query share notes list',
        tags: ['Note'],
      },
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
      },
    })
    .input(
      z.object({
        page: z.number().optional().default(1),
        size: z.number().optional().default(30),
        searchText: z.string().optional().default(''),
      }),
    )
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            account: z
              .object({
                image: z.string().optional(),
                nickname: z.string().optional(),
                name: z.string().optional(),
                id: z.number().optional(),
              })
              .nullable()
              .optional(),
            tags: z.array(
              tagsToNoteSchema.merge(
                z.object({
                  tag: tagSchema,
                }),
              ),
            ),
            _count: z.object({
              comments: z.number(),
            }),
          }),
        ),
      ),
    )
    .mutation(async function ({ input }) {
      return cache.wrap(
        '/v1/note/public-list',
        async () => {
          const { page, size, searchText } = input;
          const rows = await db.notes.findMany({
            where: {
              isShare: true,
              sharePassword: '',
              OR: [{ shareExpiryDate: { gt: new Date() } }, { shareExpiryDate: null }],
              ...(searchText != '' && { content: { contains: searchText, mode: 'insensitive' } }),
            },
            orderBy: [{ isTop: 'desc' }, { updatedAt: 'desc' }],
            skip: (page - 1) * size,
            take: size,
            include: {
              tags: { include: { tag: true } },
              account: {
                select: {
                  image: true,
                  nickname: true,
                  name: true,
                  id: true,
                },
              },
              attachments: true,
              _count: {
                select: {
                  comments: true,
                },
              },
            },
          });
          // Legacy rows may use Surreal ULID keys (notes:xxxxxxxx); stripIdPrefix
          // yields NaN and fails notesSchema.id. Drop them rather than 500.
          return rows.filter((n: any) => Number.isFinite(n?.id));
        },
        { ttl: 1000 * 5 },
      );
    }),
  listByIds: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/list-by-ids', summary: 'Query notes list by ids', protect: true, tags: ['Note'] } })
    .input(z.object({ ids: z.array(z.number()) }))
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            tags: z.array(
              tagsToNoteSchema.merge(
                z.object({
                  tag: tagSchema,
                }),
              ),
            ),
            references: z
              .array(
                z.object({
                  toNoteId: z.number(),
                  toNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            referencedBy: z
              .array(
                z.object({
                  fromNoteId: z.number(),
                  fromNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            _count: z.object({
              comments: z.number(),
              histories: z.number(),
            }),
          }),
        ),
      ),
    )
    .mutation(async function ({ input, ctx }) {
      const { ids } = input;
      return await db.notes.findMany({
        where: { id: { in: ids }, accountId: Number(ctx.id) },
        include: {
          tags: { include: { tag: true } },
          attachments: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
          references: {
            select: {
              toNoteId: true,
              toNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          referencedBy: {
            select: {
              fromNoteId: true,
              fromNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          _count: {
            select: {
              comments: true,
              histories: true,
            },
          },
        },
      });
    }),
  publicDetail: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/public-detail', summary: 'Query share note detail', tags: ['Note'] } })
    .input(
      z.object({
        shareEncryptedUrl: z.string(),
        password: z.string().optional(),
      }),
    )
    .output(
      z.object({
        hasPassword: z.boolean(),
        data: z.union([
          z.null(),
          notesSchema.merge(
            z.object({
              attachments: z.array(attachmentsSchema),
              references: z
                .array(
                  z.object({
                    toNoteId: z.number(),
                    toNote: z
                      .object({
                        content: z.string().optional(),
                        createdAt: z.date().optional(),
                        updatedAt: z.date().optional(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
              referencedBy: z
                .array(
                  z.object({
                    fromNoteId: z.number(),
                    fromNote: z
                      .object({
                        content: z.string().optional(),
                        createdAt: z.date().optional(),
                        updatedAt: z.date().optional(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
              account: z
                .object({
                  image: z.string().optional(),
                  nickname: z.string().optional(),
                  name: z.string().optional(),
                  id: z.number().optional(),
                })
                .nullable()
                .optional(),
              _count: z.object({
                comments: z.number(),
                histories: z.number(),
              }),
            }),
          ),
        ]),
        error: z.union([z.literal('expired'), z.null()]).default(null),
      }),
    )
    .mutation(async function ({ input }) {
      const { shareEncryptedUrl, password } = input;
      const note = await db.notes.findFirst({
        where: {
          shareEncryptedUrl,
          isShare: true,
          isRecycle: false,
        },
        include: {
          account: {
            select: {
              image: true,
              nickname: true,
              name: true,
              id: true,
            },
          },
          references: {
            select: {
              toNoteId: true,
              toNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          tags: true,
          attachments: true,
          _count: {
            select: {
              comments: true,
              histories: true,
            },
          },
        },
      });

      if (!note) {
        return {
          hasPassword: false,
          data: null,
        };
      }

      if (note.shareExpiryDate && new Date() > note.shareExpiryDate) {
        // throw new Error('Note expired')
        return {
          hasPassword: false,
          data: null,
          error: 'expired',
        };
      }

      if (note.sharePassword) {
        if (!password) {
          return {
            hasPassword: true,
            data: null,
          };
        }

        if (password !== note.sharePassword) {
          throw new Error('Password error');
        }
      }
      return {
        hasPassword: !!note.sharePassword,
        data: note,
      };
    }),
  detail: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/detail', summary: 'Query note detail', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .output(
      z.union([
        z.null(),
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            tags: z.array(
              tagsToNoteSchema.merge(
                z.object({
                  tag: tagSchema,
                }),
              ),
            ),
            references: z
              .array(
                z.object({
                  toNoteId: z.number(),
                  toNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            referencedBy: z
              .array(
                z.object({
                  fromNoteId: z.number(),
                  fromNote: z
                    .object({
                      content: z.string().optional(),
                      createdAt: z.date().optional(),
                      updatedAt: z.date().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            _count: z.object({
              comments: z.number(),
              histories: z.number(),
            }),
          }),
        ),
      ]),
    )
    .mutation(async function ({ input, ctx }) {
      const { id } = input;
      return await db.notes.findFirst({
        where: {
          id,
          OR: [
            { accountId: Number(ctx.id) },
            { internalShares: { some: { accountId: Number(ctx.id) } } }
          ]
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          attachments: true,
          references: {
            select: {
              toNoteId: true,
              toNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          referencedBy: {
            select: {
              fromNoteId: true,
              fromNote: {
                select: {
                  content: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          _count: { select: { comments: true, histories: true } },
        },
      });
    }),
  dailyReviewNoteList: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/note/daily-review-list', summary: 'Query daily review note list', protect: true, tags: ['Note'] } })
    .input(z.void())
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
          }),
        ),
      ),
    )
    .query(async function ({ ctx }) {
      return await db.notes.findMany({
        where: {
          createdAt: { gt: new Date(new Date().getTime() - 24 * 60 * 60 * 1000) },
          isReviewed: false,
          isArchived: false,
          isRecycle: false,
          accountId: Number(ctx.id),
        },
        orderBy: { id: 'desc' },
        include: { attachments: true },
      });
    }),
  randomNoteList: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/note/random-list', summary: 'Query random notes for review', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        limit: z.number().default(30),
      })
    )
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
          }),
        ),
      ),
    )
    .query(async function ({ input, ctx }) {
      const { limit } = input;

      const randomNotes = await db.notes.findMany({
        where: {
          isArchived: false,
          isRecycle: false,
          accountId: Number(ctx.id),
        },
        take: limit,
        // SurrealDB: no rand() aggregate ordering — shuffle a candidate pool
        // client-side (pooled well above `limit` to keep randomisation).
      });
      const pool = randomNotes.sort(() => Math.random() - 0.5).slice(0, limit);

      const noteIds = pool.map(note => note.id);
      const attachments = noteIds.length ? await db.attachments.findMany({
        where: { noteId: { in: noteIds } }
      }) : [];

      return pool.map(note => ({
        id: note.id,
        type: note.type,
        content: note.content,
        isArchived: note.isArchived,
        isRecycle: note.isRecycle,
        isShare: note.isShare,
        isTop: note.isTop,
        isReviewed: note.isReviewed,
        sharePassword: note.sharePassword || '',
        shareEncryptedUrl: note.shareEncryptedUrl,
        shareExpiryDate: note.shareExpiryDate,
        accountId: note.accountId,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        metadata: note.metadata,
        attachments: attachments.filter(att => att.noteId === note.id)
      }));
    }),
  relatedNotes: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/note/related-notes', summary: 'Query related notes', protect: true, tags: ['Note'] } })
    .input(z.object({ id: z.number() }))
    .output(z.array(
      notesSchema.merge(
        z.object({
          attachments: z.array(attachmentsSchema),
          tags: z.array(
            tagsToNoteSchema.merge(
              z.object({
                tag: tagSchema,
              }),
            ),
          ),
          references: z
            .array(
              z.object({
                toNoteId: z.number(),
                toNote: z
                  .object({
                    content: z.string().optional(),
                    createdAt: z.date().optional(),
                    updatedAt: z.date().optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
          referencedBy: z
            .array(
              z.object({
                fromNoteId: z.number(),
                fromNote: z
                  .object({
                    content: z.string().optional(),
                    createdAt: z.date().optional(),
                    updatedAt: z.date().optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
          _count: z.object({
            comments: z.number(),
            histories: z.number(),
          }),
        }),
      ),
    ))
    .query(async function ({ input, ctx }) {
      const { id } = input;

      const originalNote = await db.notes.findUnique({
        where: {
          id,
          accountId: Number(ctx.id)
        },
        select: { content: true }
      });

      if (!originalNote) {
        throw new Error('Note not found or you do not have access');
      }
      const agent = await AiModelFactory.RelatedNotesAgent();
      const extractionPrompt = `
        Please extract keywords from the following note content:
        
        ${originalNote.content.substring(0, 2000)}
      `;
      const keywordsResult = await agent.generate(extractionPrompt);
      const keywords = keywordsResult.text.trim();
      console.log("Extracted keywords:", keywords);
      const { notes } = await AiModelFactory.queryVector(keywords, Number(ctx.id), 10);
      return notes;
    }),
  reviewNote: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/review', summary: 'Review a note', protect: true, tags: ['Note'] } })
    .input(z.object({ id: z.number() }))
    .output(z.union([z.null(), notesSchema]))
    .mutation(async function ({ input, ctx }) {
      return await db.notes.update({ where: { id: input.id, accountId: Number(ctx.id) }, data: { isReviewed: true } });
    }),
  upsert: authProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/v1/note/upsert',
        summary: 'Update or create note',
        description: 'The attachments field is an array of objects with the following properties: name, path, and size which get from /api/file/upload',
        protect: true,
        tags: ['Note'],
      },
    })
    .input(
      z.object({
        content: z.union([z.string(), z.null()]).default(null),
        type: z.union([z.nativeEnum(NoteType), z.literal(-1)]).default(-1),
        attachments: z
          .array(
            z.object({
              name: z.string(),
              path: z.string(),
              size: z.union([z.string(), z.number()]),
              type: z.string(),
            }),
          )
          .default([]),
        id: z.number().optional(),
        isArchived: z.union([z.boolean(), z.null()]).default(null),
        isTop: z.union([z.boolean(), z.null()]).default(null),
        isShare: z.union([z.boolean(), z.null()]).default(null),
        isRecycle: z.union([z.boolean(), z.null()]).default(null),
        references: z.array(z.number()).optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        metadata: z.any().optional(),
      }),
    )
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      let { id, isArchived, isRecycle, type, attachments, content, isTop, isShare, references } = input;

      // Check for internal sharing permission if updating an existing note
      let isSharedEditor = false;
      if (id) {
        const notePermission = await db.notes.findFirst({
          where: {
            id,
            OR: [
              { accountId: Number(ctx.id) }, // Note owner
              { internalShares: { some: { accountId: Number(ctx.id), canEdit: true } } } // Shared with edit permission
            ]
          },
          include: {
            internalShares: {
              where: { accountId: Number(ctx.id) },
              select: { canEdit: true }
            }
          }
        });

        if (!notePermission) {
          throw new Error('Note not found or you do not have edit permission');
        }

        // If user is not the owner but has edit permission, restrict certain operations
        if (notePermission.accountId !== Number(ctx.id)) {
          isSharedEditor = true;
          // Prevent shared users from changing archive status, top status, or share status
          isArchived = null;
          isTop = null;
          isShare = null;
          isRecycle = null;
        }
      }

      const tagTree = helper.buildHashTagTreeFromHashString(extractHashtags(content?.replace(/\\/g, '') + ' '));
      let newTags: any[] = [];
      const config = await getGlobalConfig({ ctx });

      const markdownImages =
        content?.match(/!\[.*?\]\((\/api\/(?:s3)?file\/[^)]+)\)/g)?.map((match) => {
          const matches = /!\[.*?\]\((\/api\/(?:s3)?file\/[^)]+)\)/.exec(match);
          return matches?.[1] || '';
        }) || [];
      if (markdownImages.length > 0) {
        const images = await db.attachments.findMany({ where: { path: { in: markdownImages } } });
        attachments = [...attachments, ...images.map((i) => ({ path: i.path, name: i.name, size: Number(i.size), type: i.type }))];
      }

      const handleAddTags = async (tagTree: TagTreeNode[], parentTag: any | undefined, noteId?: number) => {
        for (const i of tagTree) {
          let hasTag = await db.tag.findFirst({ where: { name: i.name, parent: parentTag?.id ?? 0, accountId: Number(ctx.id) } });
          if (!hasTag) {
            hasTag = await db.tag.create({ data: { name: i.name, parent: parentTag?.id ?? 0, accountId: Number(ctx.id) } });
          }
          if (noteId) {
            const hasRelation = await db.tagsToNote.findFirst({ where: { tag: hasTag, noteId } });
            !hasRelation && (await db.tagsToNote.create({ data: { tagId: hasTag.id, noteId } }));
          }
          if (i?.children) {
            await handleAddTags(i.children, hasTag, noteId);
          }
          newTags.push(hasTag);
        }
      };

      const update: any = {
        ...(type !== -1 && { type }),
        ...(isArchived !== null && { isArchived }),
        ...(isTop !== null && { isTop }),
        ...(isShare !== null && { isShare }),
        ...(isRecycle !== null && { isRecycle }),
        ...(content != null && { content }),
        ...(input.createdAt && { createdAt: input.createdAt }),
        ...(input.updatedAt && { updatedAt: input.updatedAt }),
      };

      if (input.metadata && id) {
        const existingNote = await db.notes.findUnique({
          where: { id, accountId: Number(ctx.id) },
          select: { metadata: true }
        });

        update.metadata = {
          //@ts-ignore
          ...(existingNote?.metadata || {}),
          ...input.metadata
        };
      } else if (input.metadata) {
        update.metadata = input.metadata;
      }

      if (id) {
        const existingNote = await db.notes.findUnique({
          where: { id },
          select: {
            content: true,
            accountId: true,
            type: true,
            isArchived: true,
            isTop: true,
            isShare: true,
            isRecycle: true
          }
        });

        if (existingNote && content != null && content !== existingNote.content) {
          const latestVersion = await db.noteHistory.findFirst({
            where: { noteId: id },
            orderBy: { version: 'desc' },
            select: { version: true },
          });

          await db.noteHistory.create({
            data: {
              noteId: id,
              content: existingNote.content,
              version: (latestVersion?.version || 0) + 1,
              accountId: Number(ctx.id),
              metadata: {
                type: existingNote.type,
                isArchived: existingNote.isArchived,
                isTop: existingNote.isTop,
                isShare: existingNote.isShare,
                isRecycle: existingNote.isRecycle,
              },
            },
          });

          await pruneNoteHistory(id);
        }

        // For shared editors, we need to use a different where clause
        const whereClause = isSharedEditor
          ? { id }  // Only filter by ID for shared editors
          : { id, accountId: Number(ctx.id) }; // Filter by ID and accountId for owners

        const note = await db.notes.update({ where: whereClause, data: update });
        if (content == null) {
          SendWebhook({ ...note, attachments }, isRecycle ? 'delete' : 'update', ctx);
          return note;
        }
        const oldTagsInThisNote = await db.tagsToNote.findMany({ where: { noteId: note.id }, include: { tag: true } });
        await handleAddTags(tagTree, undefined, note.id);
        const oldTags = oldTagsInThisNote.map((i) => i.tag).filter((i) => !!i);
        const oldTagsString = oldTags.map((i) => `${i?.name}<key>${i?.parent}`);
        const newTagsString = newTags.map((i) => `${i?.name}<key>${i?.parent}`);
        const needTobeAddedRelationTags = _.difference(newTagsString, oldTagsString);
        const needToBeDeletedRelationTags = _.difference(oldTagsString, newTagsString);

        // handle references
        const oldReferences = await db.noteReference.findMany({ where: { fromNoteId: note.id } });
        const oldReferencesIds = oldReferences.map((ref) => ref.toNoteId);
        if (references !== undefined) {
          const needToBeAddedReferences = _.difference(references || [], oldReferencesIds);
          const needToBeDeletedReferences = _.difference(oldReferencesIds, references || []);

          // references delete old references
          if (needToBeDeletedReferences.length != 0) {
            await db.noteReference.deleteMany({
              where: {
                fromNoteId: note.id,
                toNoteId: { in: needToBeDeletedReferences },
              },
            });
          }

          // add new references
          if (needToBeAddedReferences.length != 0) {
            await db.noteReference.createMany({
              data: needToBeAddedReferences.map((toNoteId) => ({ fromNoteId: note.id, toNoteId })),
            });
          }
        }

        if (needToBeDeletedRelationTags.length != 0) {
          await db.tagsToNote.deleteMany({
            where: {
              note: {
                id: note.id,
              },
              tag: {
                id: {
                  in: needToBeDeletedRelationTags
                    .map((i) => {
                      const [name, parent] = i.split('<key>');
                      return oldTags.find((t) => t?.name == name && t?.parent == Number(parent))!.id;
                    })
                    .filter((i) => !!i),
                },
              },
            },
          });
        }

        if (needTobeAddedRelationTags.length != 0) {
          for (const relationTag of needTobeAddedRelationTags) {
            const [name, parent] = relationTag.split('<key>');
            const tagId = newTags.find((t) => t.name == name && t.parent == Number(parent))?.id;
            if (tagId) {
              try {
                await db.tagsToNote.create({
                  data: { noteId: note.id, tagId },
                });
              } catch (error) {
                if (error.code !== 'P2002') {
                  throw error;
                }
              }
            }
          }
        }

        // delete unused tags
        const allTagsIds = oldTags?.map((i) => i?.id);
        const usingTags = (await db.tagsToNote.findMany({ where: { tagId: { in: allTagsIds } } })).map((i) => i.tagId).filter((i) => !!i);
        const needTobeDeledTags = _.difference(allTagsIds, usingTags);
        if (needTobeDeledTags) {
          await db.tag.deleteMany({ where: { id: { in: needTobeDeledTags }, accountId: Number(ctx.id) } });
        }

        // insert not repeat attachments
        try {
          if (attachments?.length != 0) {
            const oldAttachments = await db.attachments.findMany({ where: { noteId: note.id } });
            const needTobeAddedAttachmentsPath = _.difference(
              attachments?.map((i) => i.path),
              oldAttachments.map((i) => i.path),
            );
            if (needTobeAddedAttachmentsPath.length != 0) {
              // console.log({ needTobeAddedAttachmentsPath })
              const attachmentsIds = await db.attachments.findMany({ where: { path: { in: needTobeAddedAttachmentsPath } } });
              await db.attachments.updateMany({
                where: { id: { in: attachmentsIds.map((i) => i.id) } },
                data: { noteId: note.id },
              });
            }
          }
        } catch (err) {
          console.log(err);
        }

        if (config?.embeddingModelId) {
          AiService.embeddingUpsert({ id: note.id, content: note.content, type: 'update', createTime: note.createdAt!, updatedAt: note.updatedAt });
          for (const attachment of attachments) {
            AiService.embeddingInsertAttachments({ id: note.id, updatedAt: note.updatedAt, filePath: attachment.path });
          }
        }

        SendWebhook({ ...note, attachments }, isRecycle ? 'delete' : 'update', ctx);
        return note;
      } else {
        try {
          // New plans land in the account's default agenda lane (Settings →
          // Agenda lanes). Lanes are plan-only; notes keep no lane. The lookup
          // is best-effort so a missing/disabled lane never blocks creation.
          let defaultCategoryId: number | undefined;
          if (type === NoteType.TODO) {
            try {
              const def = await db.planningCategories.findFirst({
                where: { accountId: Number(ctx.id), isDefault: true, enabled: true },
              });
              if (def) defaultCategoryId = def.id;
            } catch (cause) {
              console.error('Failed to resolve default agenda lane', cause);
            }
          }
          const note = await db.notes.create({
            data: {
              content: content ?? '',
              type,
              accountId: Number(ctx.id),
              isShare: isShare ? true : false,
              isTop: isTop ? true : false,
              ...(defaultCategoryId != null && { categoryId: defaultCategoryId }),
              ...(input.createdAt && { createdAt: input.createdAt }),
              ...(input.updatedAt && { updatedAt: input.updatedAt }),
              ...(input.metadata && { metadata: input.metadata }),
            },
          });
          await handleAddTags(tagTree, undefined, note.id);
          const attachmentsIds = await db.attachments.findMany({ where: { path: { in: attachments.map((i) => i.path) } } });
          await db.attachments.updateMany({ where: { id: { in: attachmentsIds.map((i) => i.id) } }, data: { noteId: note.id } });
          //add references
          if (references && references.length > 0) {
            await db.noteReference.createMany({
              data: references.map((toNoteId) => ({ fromNoteId: note.id, toNoteId })),
            });
          }

          if (config?.embeddingModelId) {
            AiService.embeddingUpsert({ id: note.id, content: note.content, type: 'insert', createTime: note.createdAt!, updatedAt: note.updatedAt });
            for (const attachment of attachments) {
              AiService.embeddingInsertAttachments({ id: note.id, updatedAt: note.updatedAt, filePath: attachment.path });
            }
          }

          // Process audio attachments if voice model is configured
          if (config?.voiceModelId && attachments.length > 0) {
            try {
              // Check if there are any audio attachments
              const audioAttachments = attachments.filter(attachment =>
                AiService.isAudio(attachment.name || attachment.path)
              );

              if (audioAttachments.length > 0) {
                // Run audio transcription asynchronously to not block the response
                AiService.processNoteAudioAttachments({
                  attachments: audioAttachments,
                  voiceModelId: config.voiceModelId,
                  accountId: Number(ctx.id),
                }).then(({ success, transcriptions }) => {
                  if (success && transcriptions.length > 0) {
                    // Append transcriptions to note content
                    const transcriptionText = transcriptions
                      .map(t => `${t.transcription}`)
                      .join('');

                    // Update note with transcriptions
                    db.notes.update({
                      where: { id: note.id },
                      data: { content: note.content + transcriptionText },
                    }).then(() => {
                      console.log(`Added transcriptions to note ${note.id},${transcriptionText}`);

                      // Re-run embedding if model is configured
                      if (config?.embeddingModelId) {
                        AiService.embeddingUpsert({
                          id: note.id,
                          content: note.content + transcriptionText,
                          type: 'update',
                          createTime: note.createdAt!,
                          updatedAt: new Date(),
                        });
                      }
                    }).catch((err) => {
                      console.error('Error updating note with transcription:', err);
                    });
                  }
                }).catch((err) => {
                  console.error('Error in audio transcription:', err);
                });
              }
            } catch (error) {
              console.error('Failed to start audio transcription:', error);
            }
          }

          // Process with AI if post-processing is enabled
          if (config?.isUseAiPostProcessing) {
            try {
              // Run post-processing asynchronously to not block the response
              AiService.postProcessNote({ noteId: note.id, ctx }).catch((err) => {
                console.error('Error in post-processing note:', err);
              });
            } catch (error) {
              console.error('Failed to start post-processing:', error);
            }
          }

          SendWebhook({ ...note, attachments }, 'create', ctx);

          return note;
        } catch (error) {
          console.log(error);
        }
      }
    }),

  shareNote: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/share', summary: 'Share note', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        id: z.number(),
        isCancel: z.boolean().default(false),
        password: z.string().optional(),
        expireAt: z.date().optional(),
      }),
    )
    .output(notesSchema)
    .mutation(async function ({ input, ctx }) {
      const { id, isCancel, password, expireAt } = input;

    const generateShareId = () =>
      randomBytes(16).toString('base64url').slice(0, 12);

      const note = await db.notes.findFirst({
        where: {
          id,
          accountId: Number(ctx.id),
        },
      });

      if (!note) {
        throw new Error('Note not found');
      }

      if (isCancel) {
        return await db.notes.update({
          where: { id },
          data: {
            isShare: false,
            sharePassword: '',
            shareExpiryDate: null,
            shareEncryptedUrl: null,
          },
        });
      } else {
        const shareId = note.shareEncryptedUrl || generateShareId();
        return await db.notes.update({
          where: { id },
          data: {
            isShare: true,
            shareEncryptedUrl: shareId,
            sharePassword: password,
            shareExpiryDate: expireAt,
          },
        });
      }
    }),
  updateMany: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/batch-update', summary: 'Batch update note', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        type: z.union([z.nativeEnum(NoteType), z.literal(-1)]).default(-1),
        isArchived: z.union([z.boolean(), z.null()]).default(null),
        isRecycle: z.union([z.boolean(), z.null()]).default(null),
        ids: z.array(z.number()),
      }),
    )
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      const { type, isArchived, isRecycle, ids } = input;
      const update: any = {
        ...(type !== -1 && { type }),
        ...(isArchived !== null && { isArchived }),
        ...(isRecycle !== null && { isRecycle }),
      };
      return await db.notes.updateMany({ where: { id: { in: ids }, accountId: Number(ctx.id) }, data: update });
    }),
  trashMany: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/batch-trash', summary: 'Batch trash note', protect: true, tags: ['Note'] } })
    .input(z.object({ ids: z.array(z.number()) }))
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      const { ids } = input;
      SendWebhook({ ids }, 'delete', ctx);
      return await db.notes.updateMany({ where: { id: { in: ids }, accountId: Number(ctx.id) }, data: { isRecycle: true } });
    }),
  deleteMany: authProcedure
    .use(demoAuthMiddleware)
    .meta({ openapi: { method: 'POST', path: '/v1/note/batch-delete', summary: 'Batch delete note', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        ids: z.array(z.number()),
      }),
    )
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      // Verify user owns all notes (internally shared users cannot delete)
      const notes = await db.notes.findMany({
        where: {
          id: { in: input.ids },
          accountId: Number(ctx.id) // Only allow deleting if user is the owner
        },
      });

      const allowedNoteIds = notes.map(note => note.id);

      if (allowedNoteIds.length !== input.ids.length) {
        throw new Error('Some notes cannot be deleted as you are not the owner');
      }

      return await deleteNotes(allowedNoteIds, ctx);
    }),
  addReference: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/add-reference', summary: 'Add note reference', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        fromNoteId: z.number(),
        toNoteId: z.number(),
      }),
    )
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      return await insertNoteReference({ ...input, accountId: Number(ctx.id) });
    }),
  removeReference: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/remove-reference', summary: 'Remove note reference', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        fromNoteId: z.number(),
        toNoteId: z.number(),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async function ({ input, ctx }) {
      const fromNote = await db.notes.findFirst({ where: { id: input.fromNoteId, accountId: Number(ctx.id) } });
      if (!fromNote) throw new Error('Note not found');
      await db.noteReference.deleteMany({ where: { fromNoteId: input.fromNoteId, toNoteId: input.toNoteId } });
      return { success: true };
    }),
  noteReferenceList: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/reference-list', summary: 'Query note references', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        noteId: z.number(),
        type: z.enum(['references', 'referencedBy']).default('references'),
      }),
    )
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            referenceCreatedAt: z.date(),
          }),
        ),
      ),
    )
    .mutation(async function ({ input, ctx }) {
      const { noteId, type } = input;

      if (type === 'references') {
        const references = await db.noteReference.findMany({
          where: { fromNoteId: noteId },
          include: {
            toNote: {
              include: {
                attachments: true,
                tags: { include: { tag: true } },
                references: {
                  select: { toNoteId: true },
                },
                referencedBy: {
                  select: { fromNoteId: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return references.map((ref) => ({
          ...ref.toNote,
          referenceCreatedAt: ref.createdAt,
        }));
      } else {
        const referencedBy = await db.noteReference.findMany({
          where: { toNoteId: noteId },
          include: {
            fromNote: {
              include: {
                attachments: true,
                tags: { include: { tag: true } },
                references: {
                  select: { toNoteId: true },
                },
                referencedBy: {
                  select: { fromNoteId: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return referencedBy.map((ref) => ({
          ...ref.fromNote,
          referenceCreatedAt: ref.createdAt,
        }));
      }
    }),

  clearRecycleBin: authProcedure
    .use(demoAuthMiddleware)
    .meta({ openapi: { method: 'POST', path: '/v1/note/clear-recycle-bin', summary: 'Clear recycle bin', protect: true, tags: ['Note'] } })
    .input(z.void())
    .output(z.any())
    .mutation(async function ({ ctx }) {
      const recycleBinNotes = await db.notes.findMany({
        where: {
          accountId: Number(ctx.id),
          isRecycle: true,
        },
        select: { id: true },
      });

      const noteIds = recycleBinNotes.map((note) => note.id);
      if (noteIds.length === 0) return { ok: true };

      return await deleteNotes(noteIds, ctx);
    }),
  updateAttachmentsOrder: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/update-attachments-order', summary: 'Update attachments order', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        attachments: z.array(
          z.object({
            name: z.string(),
            sortOrder: z.number(),
          }),
        ),
      }),
    )
    .output(z.any())
    .mutation(async function ({ input, ctx }) {
      const { attachments } = input;

      await Promise.all(
        attachments.map(({ name, sortOrder }) =>
          db.attachments.updateMany({
            where: {
              name,
              note: {
                accountId: Number(ctx.id),
              },
            },
            data: { sortOrder },
          }),
        ),
      );

      return { success: true };
    }),
  getNoteHistory: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/note/history', summary: 'Get note history', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        noteId: z.number(),
      }),
    )
    .output(z.array(historySchema))
    .query(async function ({ input, ctx }) {
      const { noteId } = input;
      return await db.noteHistory.findMany({
        where: { noteId, accountId: Number(ctx.id) },
        orderBy: { version: 'desc' },
      });
    }),
  getNoteVersion: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/note/version', summary: 'Get specific note version', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        noteId: z.number(),
        version: z.number().optional(),
      }),
    )
    .output(
      z.object({
        content: z.string(),
        metadata: z.any(),
        version: z.number(),
        createdAt: z.date(),
      }),
    )
    .query(async function ({ input, ctx }) {
      const { noteId, version } = input;

      const note = await db.notes.findFirst({
        where: { id: noteId, accountId: Number(ctx.id) },
      });

      if (!note) {
        throw new Error('Note not found or access denied');
      }

      if (version !== undefined) {
        const versionRecord = await db.noteHistory.findFirst({
          where: { noteId, version },
          orderBy: { version: 'desc' },
        });

        if (!versionRecord) {
          throw new Error('Version not found');
        }

        return {
          content: versionRecord.content,
          metadata: versionRecord.metadata,
          version: versionRecord.version,
          createdAt: versionRecord.createdAt,
        };
      }

      const latestVersion = await db.noteHistory.findFirst({
        where: { noteId },
        orderBy: { version: 'desc' },
      });

      if (!latestVersion) {
        return {
          content: note.content,
          metadata: {
            type: note.type,
            isArchived: note.isArchived,
            isTop: note.isTop,
            isShare: note.isShare,
            isRecycle: note.isRecycle,
          },
          version: 0,
          createdAt: note.updatedAt,
        };
      }

      return {
        content: latestVersion.content,
        metadata: latestVersion.metadata,
        version: latestVersion.version,
        createdAt: latestVersion.createdAt,
      };
    }),
  internalShareNote: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/internal-share', summary: 'Share note internally', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        id: z.number(),
        accountIds: z.array(z.number()),
        isCancel: z.boolean().default(false),
      }),
    )
    .output(z.object({
      success: z.boolean(),
      message: z.string().optional(),
    }))
    .mutation(async function ({ input, ctx }) {
      const { id, accountIds, isCancel } = input;

      const note = await db.notes.findFirst({
        where: {
          id,
          accountId: Number(ctx.id),
        },
      });

      if (!note) {
        return {
          success: false,
          message: 'Note not found'
        };
      }

      if (isCancel) {
        await db.noteInternalShare.deleteMany({
          where: {
            noteId: id,
            accountId: { in: accountIds }
          },
        });

        return {
          success: true,
          message: 'Internal sharing cancelled'
        };
      } else {
        // Filter out any accountIds that match the note owner
        const filteredAccountIds = accountIds.filter(accId => accId !== Number(ctx.id));

        // Check if the accounts exist
        const existingAccounts = await db.accounts.findMany({
          where: { id: { in: filteredAccountIds } },
          select: { id: true }
        });

        const validAccountIds = existingAccounts.map(acc => acc.id);

        // Delete any existing shares that are not in the new list
        await db.noteInternalShare.deleteMany({
          where: {
            noteId: id,
            NOT: { accountId: { in: validAccountIds } }
          },
        });

        // Create new shares
        for (const accountId of validAccountIds) {
          await db.noteInternalShare.upsert({
            where: {
              noteId_accountId: {
                noteId: id,
                accountId: accountId
              }
            },
            update: {}, // No need to update if exists
            create: {
              noteId: id,
              accountId: accountId,
              canEdit: true
            }
          });
        }

        return {
          success: true,
          message: 'Note shared internally'
        };
      }
    }),

  getInternalSharedUsers: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/internal-shared-users', summary: 'Get users with internal access to note', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .output(z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        nickname: z.string(),
        image: z.string(),
        loginType: z.string(),
        canEdit: z.boolean(),
      })
    ))
    .mutation(async function ({ input, ctx }) {
      const { id } = input;
      // Get users with internal access
      const sharedUsers = await db.noteInternalShare.findMany({
        where: { noteId: id },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              nickname: true,
              image: true,
              loginType: true,
            }
          }
        }
      });
      return sharedUsers.map(share => ({
        id: share.account.id,
        name: share.account.name,
        nickname: share.account.nickname,
        image: share.account.image,
        canEdit: share.canEdit,
        loginType: share.account.loginType,
      }));
    }),

  internalSharedWithMe: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/shared-with-me', summary: 'Get notes shared with me', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        page: z.number().default(1),
        size: z.number().default(30),
        orderBy: z.enum(['asc', 'desc']).default('desc'),
      }),
    )
    .output(
      z.array(
        notesSchema.merge(
          z.object({
            attachments: z.array(attachmentsSchema),
            tags: z.array(
              tagsToNoteSchema.merge(
                z.object({
                  tag: tagSchema,
                }),
              ),
            ),
            owner: z.object({
              id: z.number(),
              name: z.string(),
              nickname: z.string(),
              image: z.string(),
            }).nullable(),
            canEdit: z.boolean(),
            _count: z.object({
              comments: z.number(),
              histories: z.number(),
            }),
          }),
        ),
      ),
    )
    .mutation(async function ({ input, ctx }) {
      const { page, size, orderBy } = input;

      return await db.notes.findMany({
        where: {
          isRecycle: false,
          internalShares: {
            some: {
              accountId: Number(ctx.id)
            }
          }
        },
        orderBy: [{ updatedAt: orderBy }],
        skip: (page - 1) * size,
        take: size,
        include: {
          tags: { include: { tag: true } },
          attachments: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
          account: {
            select: {
              id: true,
              name: true,
              nickname: true,
              image: true,
            }
          },
          internalShares: {
            where: {
              accountId: Number(ctx.id)
            },
            select: {
              canEdit: true
            }
          },
          _count: {
            select: {
              comments: true,
              histories: true,
            },
          },
        },
      }).then(notes => notes.map(note => ({
        ...note,
        owner: note.account,
        canEdit: note.internalShares[0]?.canEdit || false,
        internalShares: undefined, // Remove this field from the response
      })));
    }),
  updateNotesOrder: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/note/update-order', summary: 'Update notes order', protect: true, tags: ['Note'] } })
    .input(
      z.object({
        updates: z.array(
          z.object({
            id: z.number(),
            sortOrder: z.number(),
          }),
        ),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async function ({ input, ctx }) {
      const { updates } = input;

      await Promise.all(
        updates.map(({ id, sortOrder }) =>
          db.notes.updateMany({
            where: {
              id,
              accountId: Number(ctx.id),
            },
            data: { sortOrder },
          }),
        ),
      );

      return { success: true };
    }),
});

let insertNoteReference = async ({ fromNoteId, toNoteId, accountId }) => {
  const [fromNote, toNote] = await Promise.all([db.notes.findUnique({ where: { id: fromNoteId, accountId } }), db.notes.findUnique({ where: { id: toNoteId, accountId } })]);

  if (!fromNote || !toNote) {
    throw new Error('Note not found');
  }

  return await db.noteReference.create({
    data: {
      fromNoteId,
      toNoteId,
    },
  });
};

export async function deleteNotes(ids: number[], ctx: Context) {
  const notes = await db.notes.findMany({
    where: { id: { in: ids }, accountId: Number(ctx.id) },
    include: {
      tags: { include: { tag: true } },
      attachments: true,
      references: true,
      referencedBy: true,
    },
  });

  const handleDeleteRelation = async () => {
    for (const note of notes) {
      SendWebhook({ ...note }, 'delete', ctx);
      await db.tagsToNote.deleteMany({ where: { noteId: note.id } });

      await db.noteReference.deleteMany({
        where: {
          OR: [{ fromNoteId: note.id }, { toNoteId: note.id }],
        },
      });

      const allTagsInThisNote = note.tags || [];
      const oldTags = allTagsInThisNote.map((i) => i.tag).filter((i) => !!i);
      const allTagsIds = oldTags?.map((i) => i?.id);
      const usingTags = (
        await db.tagsToNote.findMany({
          where: { tagId: { in: allTagsIds } },
          include: { tag: true },
        })
      )
        .map((i) => i.tag?.id)
        .filter((i) => !!i);
      const needTobeDeledTags = _.difference(allTagsIds, usingTags);
      if (needTobeDeledTags?.length) {
        await db.tag.deleteMany({ where: { id: { in: needTobeDeledTags }, accountId: Number(ctx.id) } });
      }

      if (note.attachments?.length) {
        for (const attachment of note.attachments) {
          try {
            await FileService.deleteFile(attachment.path);
          } catch (error) {
            console.log('delete attachment error:', error);
          }
        }
        await db.attachments.deleteMany({
          where: { id: { in: note.attachments.map((i) => i.id) } },
        });
      }

      AiModelFactory.queryAndDeleteVectorById(note.id);
    }
  };

  await handleDeleteRelation();
  await db.comments.deleteMany({ where: { noteId: { in: ids } } });
  await db.notes.deleteMany({ where: { id: { in: ids }, accountId: Number(ctx.id) } });
  await db.noteHistory.deleteMany({ where: { noteId: { in: ids }, accountId: Number(ctx.id) } });
  return { ok: true };
}
