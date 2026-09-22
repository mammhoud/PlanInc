/**
 * SurrealDB seed / bootstrap task — replaces the deleted schema-engine seed
 * and migrate steps.
 *
 * Run at every server start (from start.sh) BEFORE the server boots:
 *  - creates indexes and tables (idempotent),
 *  - upgrades legacy data (unhashed passwords, ownerless notes/tags),
 *  - seeds the default fonts.
 * There is no schema engine any more: the data layer in server/db.ts is
 * schemaless (Surreal), so "migrations" are just these idempotent fixes.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { surreal } from './surreal';
import { db, ensureSurrealSchema } from './db';
import { hashPassword } from './lib/password';
import { FontSeed, systemDefaultFont, cdnFonts } from './defaultFonts';

const { query, select } = surreal;

async function main() {
  try {
    await fs.mkdir('.planinc');
  } catch (error) { }

  try {
    await Promise.all([fs.mkdir('.planinc/files'), fs.mkdir('.planinc/vector'), fs.mkdir('.planinc/pgdump')]);
  } catch (error) { }

  console.log('🌱 Seeding SurrealDB schema (indexes/tables)...');
  await ensureSurrealSchema();

  // Legacy accounts (pre-Surreal imports): first account becomes superadmin,
  // ownerless notes/tags are re-assigned.
  const account = await db.accounts.findFirst({ orderBy: { id: 'asc' } });
  if (account) {
    if (!account.role) {
      await db.accounts.update({ where: { id: account.id }, data: { role: 'superadmin' } });
    }
    await db.notes.updateMany({ where: { accountId: null }, data: { accountId: account.id } });
  }

  // Hash any plaintext passwords left by an older import.
  const accounts = await db.accounts.findMany();
  for (const acc of accounts) {
    const isHash = acc.password.startsWith('pbkdf2:');
    if (!isHash) {
      await db.accounts.update({ where: { id: acc.id }, data: { password: await hashPassword(acc.password) } });
    }
  }

  // Ownerless tags go to the superadmin.
  const tagsWithoutAccount = await db.tag.findMany({ where: { accountId: null } });
  for (const acc of accounts) {
    if (acc.role == 'superadmin') {
      for (const t of tagsWithoutAccount) {
        await db.tag.update({ where: { id: t.id }, data: { accountId: acc.id } });
      }
      break;
    }
  }

  try {
    // Backfill attachment depth/perfixPath for imported rows.
    const attachmentsWithoutDepth = await db.attachments.findMany({
      where: { depth: null }
    });
    for (const attachment of attachmentsWithoutDepth) {
      const pathParts = attachment.path
        .replace('/api/file/', '')
        .replace('/api/s3file/', '')
        .split('/');
      await db.attachments.update({
        where: { id: attachment.id },
        data: {
          depth: pathParts.length - 1,
          perfixPath: pathParts.slice(0, -1).join(',')
        }
      });
    }
  } catch (error) {
    console.log(error);
  }

  await seedDefaultFonts();
  console.log('✅ SurrealDB seed complete');
}

export async function seedDefaultFonts() {
  const fontsDir = path.resolve(__dirname, '../app/public/fonts');

  const localFonts = await scanLocalFonts(fontsDir);

  const allFonts: FontSeed[] = [systemDefaultFont, ...cdnFonts, ...localFonts];

  console.log('🔤 Seeding fonts...');
  console.log(`   🌐 CDN fonts: ${cdnFonts.length}`);
  console.log(`   📁 Local fonts: ${localFonts.length}`);

  for (const font of allFonts) {
    const fontData = {
      ...font,
      fileData: font.fileData ? Buffer.from(font.fileData) : null,
    };
    await db.fonts.upsert({
      where: { name: font.name },
      update: fontData,
      create: fontData,
    });
  }
}

/**
 * Scan the fonts directory and discover all local font families
 * Expects structure: fonts/{FontName}/{FontName}-*.woff2
 */
async function scanLocalFonts(fontsDir: string): Promise<FontSeed[]> {
  try {
    await fs.access(fontsDir);
  } catch {
    console.log(`ℹ Fonts directory not found: ${fontsDir}`);
    return [];
  }

  const entries = await fs.readdir(fontsDir, { withFileTypes: true });

  const tasks = entries
    .filter(e => e.isDirectory())
    .map((entry, index) => processFontFamily(fontsDir, entry.name, index + 1));

  return (await Promise.all(tasks)).filter(
    (f): f is FontSeed => f !== null
  );
}

async function processFontFamily(
  fontsDir: string,
  fontName: string,
  sortOrder: number
): Promise<FontSeed | null> {
  try {
    const fontDir = path.join(fontsDir, fontName);
    const files = await fs.readdir(fontDir);

    const fontFiles = files.filter(f => f.endsWith('.woff') || f.endsWith('.woff2'));
    if (!fontFiles.length) return null;

    const mainFontFile = pickMainFont(fontFiles);
    if (!mainFontFile) return null;

    const filePath = path.join(fontDir, mainFontFile);
    const buffer = await fs.readFile(filePath);

    return {
      name: fontName,
      displayName: `${fontName} (Ext)`,
      url: null,
      fileData: new Uint8Array(buffer),
      isLocal: true,
      weights: isVariableFont(mainFontFile)
        ? [100, 200, 300, 400, 500, 600, 700, 800, 900]
        : [400, 500, 600, 700],
      category: detectFontCategory(fontName),
      isSystem: false,
      sortOrder,
    };
  } catch (err) {
    console.warn(`⚠ Failed to load font: ${fontName}`);
    return null;
  }
}

function pickMainFont(files: string[]): string | null {
  return (
    files.find(f => /variablefont/i.test(f) && !/italic/i.test(f) && f.endsWith('.woff2')) ||
    files.find(f => !/italic/i.test(f) && f.endsWith('.woff2')) ||
    files.find(f => f.endsWith('.woff2')) ||
    files[0] ||
    null
  );
}

function isVariableFont(fileName: string): boolean {
  return /variablefont/i.test(fileName);
}

function detectFontCategory(fontName: string): string {
  const n = fontName.toLowerCase();
  if (/mono|code/.test(n)) return 'monospace';
  if (/serif/.test(n) && !/sans/.test(n)) return 'serif';
  if (/script|hand|caveat|pacifico|dancing/.test(n)) return 'handwriting';
  if (/display|title|impact/.test(n)) return 'display';
  return 'sans-serif';
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('seed failed:', e);
    process.exit(1);
  });
