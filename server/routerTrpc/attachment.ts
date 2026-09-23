import { router, authProcedure } from '../middleware';
import { z } from 'zod';
import { db } from '../db';
import { select as surrealSelect } from '../surreal';
import path from 'path';
import { FileService } from '../lib/files';

export interface AttachmentResult {
  id: number | null;
  path: string;
  name: string;
  size: string | null;
  type: string | null;
  isShare: boolean;
  sharePassword: string;
  noteId: number | null;
  sortOrder: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  isFolder: boolean;
  folderName: string | null;
}

// The list query mixes `db.attachments.findMany` (which normalises record ids to
// numbers) with raw `surrealSelect` rows, whose `id` is still `attachments:<n>`.
// The client treats ids as numbers (selection keys, move `sourceIds`), so the
// raw branches must normalise too or drag-and-drop silently no-ops.
const numericId = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(String(value).split(':').pop());
  return Number.isFinite(parsed) ? parsed : null;
};

// Attachments can reach an account two ways: uploaded against a note
// (`note.accountId`) or owned directly by the account (`accountId`, which is what
// uploads and folder placeholders set). `list` scopes by both, so every read and
// mutation must as well — a mutation that only checks `note.accountId` matches
// zero rows for note-less attachments and fails with "Attachment(s) not found".
const accountScope = (ctx: { id: unknown }) => ({
  OR: [
    {
      note: {
        accountId: Number(ctx.id)
      }
    },
    {
      accountId: Number(ctx.id)
    }
  ]
});

const mapAttachmentResult = (item: any): AttachmentResult => ({
  id: numericId(item.id),
  path: item.path,
  name: item.name,
  size: item.size?.toString() || null,
  type: item.type,
  isShare: item.isShare,
  sharePassword: item.sharePassword,
  noteId: item.noteId,
  sortOrder: item.sortOrder,
  createdAt: item.createdAt ? new Date(item.createdAt) : null,
  updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
  isFolder: item.is_folder,
  folderName: item.folder_name
});

export const attachmentsRouter = router({
  createFolder: authProcedure
    .input(z.object({
      folderName: z.string(),
      parentFolder: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const { folderName, parentFolder } = input;
      
      // Build the folder path
      const folderPath = parentFolder 
        ? `${parentFolder.split('/').join(',')},${folderName}`
        : folderName;
      
      // Create a placeholder attachment record for the folder
      const placeholder = await db.attachments.create({
        data: {
          path: `/api/file/${parentFolder ? `${parentFolder}/` : ''}${folderName}/.folder`,
          name: '.folder',
          size: 0,
          type: 'folder',
          perfixPath: folderPath,
          accountId: Number(ctx.id),
          isShare: false,
          sharePassword: '',
          sortOrder: 0
        }
      });
      
      return {
        success: true,
        folderName,
        folderPath
      };
    }),
  
  list: authProcedure
    .input(z.object({
      page: z.number().default(1),
      size: z.number().default(10),
      searchText: z.string().default('').optional(),
      folder: z.string().optional()
    }))
    .query(async function ({ input, ctx }) {
      const { page, size, searchText, folder } = input;
      const skip = (page - 1) * size;

      if (searchText) {
        const attachments = await db.attachments.findMany({
          where: {
            OR: [
              {
                note: {
                  accountId: Number(ctx.id)
                }
              },
              {
                accountId: Number(ctx.id)
              }
            ],
            AND: {
              OR: [
                { name: { contains: searchText, mode: 'insensitive' } },
                { path: { contains: searchText, mode: 'insensitive' } }
              ]
            }
          },
          orderBy: [
            { sortOrder: 'asc' },
            { updatedAt: 'desc' }
          ],
          take: size,
          skip: skip
        });

        return attachments.map(item => ({
          id: item.id,
          path: item.path,
          name: item.name,
          size: item.size?.toString() || null,
          type: item.type,
          isShare: item.isShare,
          sharePassword: item.sharePassword,
          noteId: item.noteId,
          sortOrder: item.sortOrder,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          isFolder: false,
          folderName: null
        }));
      }

      if (folder) {
        const folderPath = folder.split('/').join(',');
        const depth = folderPath.split(',').length;

        // SurrealDB replacement for the old UNION ALL raw query:
        // immediate children (folders flattened, deduped) + files in this folder.
        const childRows = await surrealSelect<any>(
          `SELECT perfixPath FROM attachments
           WHERE perfixPath != NONE
             AND string::starts_with(perfixPath, ${JSON.stringify(folderPath + ',')})
             AND (accountId = ${Number(ctx.id)} OR noteId IN (SELECT value id FROM notes WHERE accountId = ${Number(ctx.id)}));`
        );
        const folderSet = new Map<string, any>();
        for (const row of childRows) {
          const parts = String(row.perfixPath).split(',');
          if (parts.length <= depth) continue;
          const name = parts[depth];
          if (!folderSet.has(name)) {
            const prefix = parts.slice(0, depth + 1).join(',');
            folderSet.set(name, {
              id: null,
              path: `/api/file/${parts.slice(0, depth + 1).join('/')}`,
              name,
              size: null,
              type: null,
              isShare: false,
              sharePassword: '',
              noteId: null,
              sortOrder: 0,
              createdAt: null,
              updatedAt: null,
              is_folder: true,
              folder_name: name,
              _prefix: prefix,
            });
          }
        }

        const fileRows = await surrealSelect<any>(
          `SELECT * FROM attachments
           WHERE perfixPath = ${JSON.stringify(folderPath)}
             AND (accountId = ${Number(ctx.id)} OR noteId IN (SELECT value id FROM notes WHERE accountId = ${Number(ctx.id)}))
           ORDER BY sortOrder ASC, updatedAt DESC
           LIMIT ${size} START ${skip};`
        );

        const folders = [...folderSet.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, Math.max(0, size - fileRows.length));
        const results = [...folders, ...fileRows.map(f => ({ ...f, is_folder: false, folder_name: null }))];
        return results.map(mapAttachmentResult);
      }

      // SurrealDB replacement for the root-level listing raw query:
      // top-level folders (deduped by first perfixPath segment) + root files.
      const allRows = await surrealSelect<any>(
        `SELECT perfixPath, depth FROM attachments
         WHERE (accountId = ${Number(ctx.id)} OR noteId IN (SELECT value id FROM notes WHERE accountId = ${Number(ctx.id)}));`
      );
      const search = (searchText || '').toLowerCase();
      const folderSet = new Map<string, any>();
      for (const row of allRows) {
        const prefix = String(row.perfixPath || '');
        if (!prefix) continue;
        if (search && !prefix.toLowerCase().includes(search)) continue;
        const first = prefix.split(',')[0]!;
        if (!folderSet.has(first)) {
          folderSet.set(first, {
            id: null,
            path: `/api/file/${first}`,
            name: first,
            size: null,
            type: null,
            isShare: false,
            sharePassword: '',
            noteId: null,
            sortOrder: 0,
            createdAt: null,
            updatedAt: null,
            is_folder: true,
            folder_name: first,
          });
        }
      }

      const fileWhere = search
        ? `string::matches(path, ${JSON.stringify('(?i)' + search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))})`
        : 'depth = 0';
      const fileRows = await surrealSelect<any>(
        `SELECT * FROM attachments
         WHERE ${fileWhere}
           AND (accountId = ${Number(ctx.id)} OR noteId IN (SELECT value id FROM notes WHERE accountId = ${Number(ctx.id)}))
         ORDER BY sortOrder ASC, updatedAt DESC
         LIMIT ${size} START ${skip};`
      );

      const folders = [...folderSet.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, Math.max(0, size - fileRows.length));
      const results = [...folders, ...fileRows.map(f => ({ ...f, is_folder: false, folder_name: null }))];
      return results.map(mapAttachmentResult);
    }),

  rename: authProcedure
    .input(z.object({
      id: z.number().optional(),
      newName: z.string(),
      isFolder: z.boolean().optional(),
      oldFolderPath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, newName, isFolder, oldFolderPath } = input;

      if (!isFolder && (newName.includes('/') || newName.includes('\\'))) {
        throw new Error('File names cannot contain path separators');
      }

      return await db.$transaction(async (tx) => {
        if (isFolder && oldFolderPath) {
          const attachments = await tx.attachments.findMany({
            where: {
              OR: [
                {
                  note: {
                    accountId: Number(ctx.id)
                  },
                },
                {
                  accountId: Number(ctx.id)
                }
              ],
              perfixPath: {
                startsWith: oldFolderPath
              }
            }
          });

          try {
            for (const attachment of attachments) {
              const newPerfixPath = attachment.perfixPath?.replace(oldFolderPath, newName);
              const oldPath = attachment.path;
              const isS3File = oldPath.startsWith('/api/s3file/');
              const baseUrl = isS3File ? '/api/s3file/' : '/api/file/';

              const newPath = attachment.path.replace(
                `${baseUrl}${oldFolderPath.split(',').join('/')}`,
                `${baseUrl}${newName.split(',').join('/')}`
              );

              await FileService.moveFile(oldPath, newPath);

              await tx.attachments.update({
                where: { id: attachment.id },
                data: {
                  perfixPath: newPerfixPath,
                  path: newPath,
                  depth: newPerfixPath?.split(',').length
                }
              });
            }
            return { success: true };
          } catch (error) {
            throw new Error(`Failed to rename folder: ${error.message}`);
          }
        }

        const attachment = await tx.attachments.findFirst({
          where: {
            id,
            ...accountScope(ctx)
          }
        });

        if (!attachment) {
          throw new Error('Attachment not found');
        }

        try {
          await FileService.renameFile(attachment.path, input.newName);
          return await tx.attachments.update({
            where: { id: input.id },
            data: {
              name: input.newName,
              path: attachment.path.replace(attachment.name, input.newName)
            }
          });
        } catch (error) {
          throw new Error(`Failed to rename file: ${error.message}`);
        }
      });
    }),

  move: authProcedure
    .input(z.object({
      sourceIds: z.array(z.number()),
      targetFolder: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { sourceIds, targetFolder } = input;

      return await db.$transaction(async (tx) => {
        const attachments = await tx.attachments.findMany({
          where: {
            id: { in: sourceIds },
            ...accountScope(ctx)
          }
        });

        if (attachments.length === 0) {
          throw new Error('Attachments not found');
        }

        try {
          for (const attachment of attachments) {
            const newPerfixPath = targetFolder;
            const oldPath = attachment.path;
            const isS3File = oldPath.startsWith('/api/s3file/');
            const baseUrl = isS3File ? '/api/s3file/' : '/api/file/';

            const newPath = targetFolder 
              ? `${baseUrl}${targetFolder.split(',').join('/')}/${attachment.name}`
              : `${baseUrl}${attachment.name}`;

            await FileService.moveFile(oldPath, newPath);

            await tx.attachments.update({
              where: { id: attachment.id },
              data: {
                perfixPath: newPerfixPath,
                depth: newPerfixPath ? newPerfixPath.split(',').length : 0,
                path: newPath
              }
            });
          }
          
          return {
            success: true,
            message: 'Files moved successfully'
          };
        } catch (error) {
          console.error('Move file error:', error);
          throw new Error(`Failed to move files: ${error.message}`);
        }
      });
    }),

  delete: authProcedure
    .input(z.object({
      id: z.union([z.number(),z.null()]).optional(),
      isFolder: z.boolean().optional(),
      folderPath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, isFolder, folderPath } = input;

      return await db.$transaction(async (tx) => {
        if (isFolder && folderPath) {
          const attachments = await tx.attachments.findMany({
            where: {
              ...accountScope(ctx),
              perfixPath: {
                startsWith: folderPath
              }
            }
          });

          if (attachments.length === 0) {
            return { success: true, message: 'Folder deleted successfully' };
          }

          try {
            for (const attachment of attachments) {
              await FileService.deleteFile(attachment.path);
            }
            return { success: true, message: 'Folder and its contents deleted successfully' };
          } catch (error) {
            throw new Error(`Failed to delete folder: ${error.message}`);
          }
        }

        const attachment = await tx.attachments.findFirst({
          where: {
            id: id!,
            ...accountScope(ctx)
          }
        });

        if (!attachment) {
          throw new Error('Attachment not found or you do not have permission to delete it');
        }

        try {
          await FileService.deleteFile(attachment.path);
          return {
            success: true,
            message: 'File deleted successfully'
          };
        } catch (error) {
          throw new Error(`Failed to delete file: ${error.message}`);
        }
      });
    }),
    deleteMany: authProcedure
    .input(z.object({
      ids: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { ids } = input;
      // Security fix: Only allow deleting attachments owned by the user
      const attachments = await db.attachments.findMany({
        where: {
          id: { in: ids },
          ...accountScope(ctx)
        }
      });

      // Delete each file from storage (FileService.deleteFile also removes the DB record)
      for (const attachment of attachments) {
        try {
          await FileService.deleteFile(attachment.path);
        } catch (error) {
          console.error(`Failed to delete file ${attachment.path}:`, error);
        }
      }

      return { success: true, message: 'Files deleted successfully' };
    }),
});
