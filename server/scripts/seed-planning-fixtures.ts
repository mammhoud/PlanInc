import { db } from '../db';

const fixturePrefix = '[fixture]';

async function main() {
  const accounts = await db.accounts.findMany({ orderBy: { id: 'asc' } });
  if (!accounts.length) {
    throw new Error('No account exists. Create or sign in a PlanInc account before loading fixtures.');
  }

  const fixtureTickets = [
    {
      title: 'Review responsive navigation',
      description: 'Verify sidebar lanes and mobile navigation remain discoverable at tablet width.',
      status: 'in_progress',
      priority: 'high',
      category: 'Product',
      tags: ['navigation', 'responsive'],
    },
    {
      title: 'Validate resource archive downloads',
      description: 'Check selected files and folders produce an account-scoped ZIP archive.',
      status: 'open',
      priority: 'medium',
      category: 'Quality',
      tags: ['resources', 'testing'],
    },
    {
      title: 'Document release findings',
      description: 'Capture the preview checklist and any runtime issues discovered during validation.',
      status: 'done',
      priority: 'low',
      category: 'Documentation',
      tags: ['release', 'docs'],
    },
  ] as const;

  const fixtureStudies = [
    {
      title: 'PlanInc UX validation',
      description: 'Study the responsive information architecture and interaction patterns.',
      status: 'active',
      category: 'Research',
      tags: ['ux', 'responsive'],
      sourceUrl: 'https://example.com/planinc-ux-validation',
    },
    {
      title: 'File workflow audit',
      description: 'Review upload, folder, move, and archive behavior across local storage.',
      status: 'planned',
      category: 'Engineering',
      tags: ['files', 'security'],
      sourceUrl: 'https://example.com/file-workflow-audit',
    },
  ] as const;

  for (const account of accounts) {
    const accountId = Number(account.id);
    const existingTickets = await db.tickets.findMany({ where: { accountId } });
    const existingStudies = await db.studyItems.findMany({ where: { accountId } });

    for (const fixture of fixtureTickets) {
      const exists = existingTickets.some((ticket) => ticket.title === `${fixturePrefix} ${fixture.title}`);
      if (!exists) {
        await db.tickets.create({
          data: {
            ...fixture,
            title: `${fixturePrefix} ${fixture.title}`,
            accountId,
            noteId: null,
            studyItemId: null,
            tags: [...fixture.tags],
          },
        });
      }
    }

    for (const fixture of fixtureStudies) {
      const exists = existingStudies.some((study) => study.title === `${fixturePrefix} ${fixture.title}`);
      if (!exists) {
        await db.studyItems.create({
          data: {
            ...fixture,
            title: `${fixturePrefix} ${fixture.title}`,
            accountId,
            noteId: null,
            tags: [...fixture.tags],
          },
        });
      }
    }

    const tickets = await db.tickets.findMany({ where: { accountId } });
    const studies = await db.studyItems.findMany({ where: { accountId } });
    console.log(`Loaded planning fixtures for account ${accountId}: ${tickets.length} tickets, ${studies.length} studies.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Planning fixture load failed:', error);
    process.exit(1);
  });
