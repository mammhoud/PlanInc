import { db } from './db'
import path from 'path'

export const tag = [
  {
    "id": 1,
    "name": "Welcome",
    "icon": "\uD83C\uDF89",
    "parent": 0
  },
  {
    "id": 2,
    "name": "Attachment",
    "icon": "\uD83D\uDD16",
    "parent": 1
  },
  {
    "id": 3,
    "name": "Code",
    "icon": "\uD83E\uDE84",
    "parent": 1
  },
  {
    "id": 4,
    "name": "To-Do",
    "icon": "✨",
    "parent": 1
  },
  {
    "id": 5,
    "name": "Multi-Level-Tags",
    "icon": "\uD83C\uDFF7\uFE0F",
    "parent": 1
  }
]

export const attachments: any = [
  {
    "id": 1,
    "isShare": false,
    "sharePassword": "",
    "name": "pic01.png",
    "path": "/api/file/pic01.png",
    "size": 1360952,
    "type": "image/png",
    "noteId": 2
  },
  {
    "id": 2,
    "isShare": false,
    "sharePassword": "",
    "name": "pic02.png",
    "path": "/api/file/pic02.png",
    "size": 971782,
    "type": "image/png",
    "noteId": 2
  },
  {
    "id": 3,
    "isShare": false,
    "sharePassword": "",
    "name": "pic03.png",
    "path": "/api/file/pic03.png",
    "size": 141428,
    "type": "image/png",
    "noteId": 2
  },
  {
    "id": 4,
    "isShare": false,
    "sharePassword": "",
    "name": "pic04.png",
    "path": "/api/file/pic04.png",
    "size": 589371,
    "type": "image/png",
    "noteId": 2
  },
  {
    "id": 5,
    "isShare": false,
    "sharePassword": "",
    "name": "pic06.png",
    "path": "/api/file/pic06.png",
    "size": 875361,
    "type": "image/png",
    "noteId": 2
  },
  {
    "id": 6,
    "isShare": false,
    "sharePassword": "",
    "name": "story.txt",
    "path": "/api/file/story.txt",
    "size": 12,
    "type": "text/plain",
    "noteId": 2
  }
]

export const notes = [
  {
    "id": 1,
    "type": 0,
    "content": "#Welcome\n\nWelcome to PlanInc!\n\nWhether you're capturing ideas, taking meeting notes, or planning your schedule, PlanInc provides an easy and efficient way to manage it all. Here, you can create, edit, and share notes anytime, anywhere, ensuring you never lose a valuable thought.",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 2,
    "type": 0,
    "content": "#Welcome/Attachment",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 3,
    "type": 0,
    "content": "#Welcome/Code\n\n\n\n```js\nfunction Welcome(){\n  console.log(\"Hello! PlanInc\");\n}\n```",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 4,
    "type": 2,
    "content": "#Welcome/To-Do\n\n* Create a planinc\n* Create a note\n* Upload file",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 5,
    "type": 0,
    "content": "#Welcome/Multi-Level-Tags\n\nUse the \"/\" shortcut to effortlessly create and organize multi-level tags.",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 6,
    "type": 1,
    "content": "https://github.com/mammhoud/planinc/",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 7,
    "type": 2,
    "content": "#Welcome/Tasks\n\n- [ ] Try the Plans board\n- [ ] Group by status\n- [ ] Mark a plan complete",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  }
]

export const tagsToNote = [
  {
    "id": 1,
    "noteId": 1,
    "tagId": 1
  },
  {
    "id": 2,
    "noteId": 2,
    "tagId": 1
  },
  {
    "id": 3,
    "noteId": 2,
    "tagId": 2
  },
  {
    "id": 4,
    "noteId": 3,
    "tagId": 1
  },
  {
    "id": 5,
    "noteId": 3,
    "tagId": 3
  },
  {
    "id": 6,
    "noteId": 4,
    "tagId": 1
  },
  {
    "id": 7,
    "noteId": 4,
    "tagId": 4
  },
  {
    "id": 8,
    "noteId": 5,
    "tagId": 1
  },
  {
    "id": 9,
    "noteId": 5,
    "tagId": 5
  }
]

/**
 * Default deploy content: 13 PlanInc-shaped notes mirroring the project docs
 * agenda pack (MAIN, INDEX, SUMMARY, README, CONTENT_MODEL, meeting-agenda,
 * feature-tracking, task-tracking, team-notes, dev-team-plans,
 * completion-checklist, startup-story, anytype-extensibility). Content is
 * rewritten to describe PlanInc so a fresh install has useful, app-related
 * material without any external database.
 */
export const agendaNotes: Array<{ id: number; type: number; content: string }> = [
  {
    id: 101,
    type: 0,
    content: `#Agenda/Main — PlanInc Project Agenda

PlanInc's delivery command center: milestones, sprint work, and product claims live in Agenda.

- Open \`/?path=agenda\` for the merged stream (All / PlanInc / Notes / Plans).
- Kanban, calendar, and timeline views group plans by category or status.
- Notes filter shows card/grid/list only.

Owner: workspace · Status: active`,
  },
  {
    id: 102,
    type: 0,
    content: `#Agenda/Index — PlanInc documentation map

| Doc | Focus |
|-----|-------|
| Agenda/Main | Hub and view guide |
| Agenda/Content model | Tags, types, object rules |
| Agenda/Feature tracking | Idea → shipped lifecycle |
| Agenda/Task tracking | Sprint tasks and owners |
| Agenda/Team notes | Decisions and blockers |
| Agenda/Dev team plans | Engineering slices |
| Agenda/Completion checklist | Definition of done |
| Agenda/Meeting agenda | Standup / retro templates |
| Agenda/Startup story | Founder journey |
| Agenda/Anytype extensibility | Knowledge-graph research |
| Agenda/Summary | System overview |
| Agenda/README | Inventory |
| Welcome | First-run tour`,
  },
  {
    id: 103,
    type: 0,
    content: `#Agenda/Summary — PlanInc agenda system

PlanInc Agenda is the delivery + memory layer for the product:

- **Views:** cards, grid, list, kanban, calendar, timeline under \`/?path=agenda\`.
- **Types:** type 0 PlanInc plans, type 1 notes, type 2 todos (filter via \`?type=\`).
- **Tags:** hierarchical tags with \`/\` shortcut; multi-level tags welcome.
- **Sharing:** public links with optional password + expiry; email invites under \`/share/invite/:token\`.
- **Study / Skills / Tickets:** planning lanes on the side nav.

Seeded automatically on first deploy — no external database required.`,
  },
  {
    id: 104,
    type: 0,
    content: `#Agenda/README — PlanInc inventory

**English.** PlanInc groups default content by role:

| Group | Seeded notes | Role |
|---|---|---|
| Hubs | Agenda/Main, Agenda/Index, Agenda/Summary, Agenda/README | Navigation and contract |
| Delivery | Agenda/Feature tracking, Agenda/Task tracking, Agenda/Team notes | Milestones, sprints, decisions |
| Business | Agenda/Dev team plans, Agenda/Startup story | Engineering + founder journey |
| Rhythm | Agenda/Meeting agenda, Agenda/Completion checklist | Cadence and closeout |
| Research | Agenda/Anytype extensibility, Welcome | Knowledge graph + tour |

**العربية.** محتوى افتراضي من 13 مذكرة مرتبطة بالتطبيق PlanInc يُزرع تلقائياً عند النشر.`,
  },
  {
    id: 105,
    type: 0,
    content: `#Agenda/Content model — PlanInc object rules

PlanInc stores every row as a note-like object:

- **type** 0 = plan/board card · 1 = plain note · 2 = todo/plan task
- **content** markdown; first line \`#Title\` is the display title
- **tags** via \`tagsToNote\`; tags have name, icon, parent (nesting)
- **category** optional plan lane (Uncategorised, Now, Next, Later…); Done is a status, not a category
- **share*** fields power public links (\`/share/:id\`) and passwords

Read this first when changing seed or schema files in \`server/seedData.ts\` and \`server/db.ts\`.`,
  },
  {
    id: 106,
    type: 0,
    content: `#Agenda/Meeting agenda — PlanInc templates

## Standup (15m)
1. What shipped since last standup?
2. What's next on the Agenda board?
3. Blockers?

## Sprint planning
- Review Feature tracking + Task tracking
- Pull into Now / Next / Later lanes
- Set expiry dates on plans

## Retrospective
- What went well in PlanInc delivery?
- What to improve in sharing, study, or settings?

## Closeout
- Walk Completion checklist
- Archive finished plans`,
  },
  {
    id: 107,
    type: 0,
    content: `#Agenda/Feature tracking — PlanInc lifecycle

Track every PlanInc feature: **Proposed → Prioritized → In progress → Review → Shipped**.

Shipped examples:
- Merged Agenda stream (\`/?path=agenda\`) with type filters
- Share links with password + expiry + email invite route
- Study flashcards (SM-2) and Skills mastery page
- Settings phone UX, side-nav lanes, trash undo

Open items live as plans on the board; one file-equivalent per feature in this note.`,
  },
  {
    id: 108,
    type: 2,
    content: `#Agenda/Task tracking — PlanInc sprint board

- [ ] Verify Agenda type filters on web + desktop
- [ ] Confirm share invite accepts at \`/share/invite/:token\`
- [ ] Run \`check:contracts\` (token budget 159)
- [ ] Smoke tickets, study, skills, analytics after deploy
- [ ] Update docs INDEX when new Agenda pages land
- [ ] Review analytics tagStats after seed reset`,
  },
  {
    id: 109,
    type: 0,
    content: `#Agenda/Team notes — PlanInc decisions

**2026-09-23 — Agenda merge.** Notes + Plans unified under \`/?path=agenda\` with \`?type=all|planinc|note|todo\`. Legacy \`?path=notes|todo\` aliases remain.

**Share links.** Server prefers \`PLANINC_PUBLIC_URL\`; admin approval no longer wipes share passwords; invite route added.

**Seed.** 13 Agenda notes ship as default deploy content; first registration or boot seeds when \`#Welcome\` is missing.

**Auth.** Superuser bootstraps from \`PLANINC_SUPERUSER_NAME\` / \`PLANINC_SUPERUSER_PASSWORD\` on every boot.`,
  },
  {
    id: 110,
    type: 0,
    content: `#Agenda/Dev team plans — PlanInc engineering

| Slice | Priority | Status | Next gate |
|-------|:--------:|--------|-----------|
| Single frontend (web/PWA/Tauri) | P0 | Shipped | Store listing polish |
| Agenda + planning board | P0 | Shipped | Type-filter UX QA |
| Sharing & approvals | P0 | Shipped | Invite e2e |
| Study / Skills / Tickets | P1 | Shipped | SRS tuning |
| AI providers + MCP | P1 | Shipped | Live keys |
| Django + django-bolt migration | P2 | Foundation | Postgres/Redis rehearsal |

Outcome notes only — implementation lives under \`server/\` and \`frontend/src\`.`,
  },
  {
    id: 111,
    type: 0,
    content: `#Agenda/Completion checklist — PlanInc closeout

- [ ] \`bun run --cwd frontend check:contracts\` passes
- [ ] Canonical Playwright suite green
- [ ] Share create + open + password gate verified
- [ ] Agenda aliases \`notes\` / \`todo\` still load
- [ ] Superuser can sign in with deploy password
- [ ] Seed notes visible on fresh DB
- [ ] No pageErrors / 4xx on smoke paths
- [ ] Docs INDEX links resolve`,
  },
  {
    id: 112,
    type: 1,
    content: `#Agenda/Startup story — PlanInc journey

PlanInc began as a Blinko-inspired open-source note + plan app and grew into a multi-platform workspace:

1. **Capture** — markdown notes, attachments, tags
2. **Plan** — boards, calendars, categories
3. **Learn** — study flashcards and skill mastery
4. **Share** — public links and internal invites
5. **Ship** — Docker deploy on one port (1111)

Achievement board lives in Agenda/Summary; engineering outcomes in Agenda/Dev team plans.`,
  },
  {
    id: 113,
    type: 0,
    content: `#Agenda/Anytype extensibility — PlanInc knowledge graph research

Research notes on object-based knowledge models applied to PlanInc:

- Notes, plans, tickets, and study items are typed objects
- Tags form a parent/child graph (multi-level \`/\` tags)
- Graph view (\`/graph\`) links notes, tickets, resources, agents
- Future: bidirectional backlinks panel and object type registry

Maps the Anytype package model onto PlanInc's SurrealDB schema without adding a second database.`,
  },
]

export async function createSeed(accountId: number) {
  try {
    // Categories are lanes (Now/Next/Later); Done is a card status (mark
    // complete / archived), never a category. Retire the un-worked Ideas
    // bucket so no board still shows an empty idea column. Idempotent.
    await migrateRetiredIdeasCategory();

    const accountNotes = await db.notes.findMany({ where: { accountId } });
    const hasWelcome = accountNotes.some(
      n => typeof n.content === 'string' && n.content.includes('#Welcome')
    );
    if (accountNotes.length === 0 || !hasWelcome) {
      await db.notes.createMany({
        data: notes.map(note => ({
          ...note,
          accountId,
          isArchived: false,
          isRecycle: false,
          isShare: false,
          isTop: false,
        }))
      })
    }

    // 13 Agenda pack notes — app-related default content for deploys with no DB.
    const hasAgendaPack = accountNotes.some(
      n => typeof n.content === 'string' && n.content.includes('#Agenda/')
    );
    if (!hasAgendaPack) {
      await db.notes.createMany({
        data: agendaNotes.map(note => ({
          ...note,
          accountId,
          isArchived: false,
          isRecycle: false,
          isShare: false,
          isTop: false,
          sharePassword: '',
        })),
        skipDuplicates: true,
      })
    }

    const hasTags = await db.tag.findMany({ where: { accountId } });
    if (hasTags.length === 0) {
      await db.tag.createMany({
        data: tag.map(t => ({
          ...t,
          accountId,
          icon: t.icon ?? '',
          parent: t.parent ?? 0,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      })
      await db.tagsToNote.createMany({ data: tagsToNote, skipDuplicates: true });
    } else {
      // Backfill icon/parent/dates on tags that predate the schema fields
      // (missing values fail notes.list output validation).
      for (const t of hasTags) {
        const patch: Record<string, unknown> = {};
        if (t.icon == null || t.icon === '') patch.icon = tag.find(x => x.id === t.id)?.icon ?? '';
        if (t.parent == null) patch.parent = tag.find(x => x.id === t.id)?.parent ?? 0;
        if (!t.createdAt || Number.isNaN(new Date(t.createdAt).getTime())) patch.createdAt = new Date();
        if (!t.updatedAt || Number.isNaN(new Date(t.updatedAt).getTime())) patch.updatedAt = new Date();
        if (Object.keys(patch).length) {
          await db.tag.update({ where: { id: t.id }, data: patch });
        }
      }
    }

    const hasAttachments = await db.attachments.findMany({ where: { accountId } });
    if (hasAttachments.length === 0) {
      await db.attachments.createMany({
        data: attachments.map(a => ({
          ...a,
          accountId,
          isShare: false,
          sortOrder: 0,
          depth: 0,
          perfixPath: '',
        })),
        skipDuplicates: true,
      })
    }

    // Prefer package-relative seedfiles (source tree); fall back to the
    // cwd-relative copy the production image ships next to the bundle.
    const candidates = [
      path.resolve(__dirname, 'seedfiles'),
      path.resolve(process.cwd(), 'server/seedfiles'),
      path.resolve(process.cwd(), 'seedfiles'),
    ];
    const uploadRoot = path.join(process.cwd(), '.planinc', 'files');
    const fsp = await import('fs/promises');
    await fsp.mkdir(uploadRoot, { recursive: true });
    let seedDir: string | null = null;
    for (const dir of candidates) {
      try {
        await fsp.access(dir);
        seedDir = dir;
        break;
      } catch { /* try next */ }
    }
    if (seedDir) {
      const entries = await fsp.readdir(seedDir);
      for (const name of entries) {
        try { await fsp.copyFile(path.join(seedDir, name), path.join(uploadRoot, name)); } catch { /* non-fatal */ }
      }
    }
  } catch (error) {
    console.error('createSeed error', error)
  }
}

/** Idempotent: clear the un-worked Ideas lane and move its plans to uncategorised. */
async function migrateRetiredIdeasCategory(): Promise<void> {
  try {
    const ideas = await db.planningCategories.findMany({ where: { slug: 'ideas' } });
    for (const category of ideas) {
      const plans = await db.notes.findMany({ where: { categoryId: category.id } });
      for (const plan of plans) {
        // Same reassignment path as planningCategories.delete: drop the lane
        // pointer only — tags/tagsToNote stay intact for the note itself.
        await db.notes.update({
          where: { id: plan.id },
          data: { categoryId: null },
        });
      }
      await db.planningCategories.delete({ where: { id: category.id } });
      console.log(`  ↳ retired Ideas lane (id ${category.id}) → ${plans.length} plan(s) uncategorised`);
    }
  } catch (error) {
    console.log('Ideas category migration skipped:', error);
  }
}
