import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { db } from '../db';
import { hashPassword } from '../lib/password';

function getArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function promptSecret(message: string): Promise<string> {
  const readline = createInterface({ input, output });
  try {
    return (await readline.question(message, { hideEchoBack: true })).trim();
  } finally {
    readline.close();
  }
}

const name = getArgument('name') || process.env.PLANINC_SUPERUSER_NAME || '';
const password = getArgument('password') || process.env.PLANINC_SUPERUSER_PASSWORD || '';
const username = name.trim();
const secret = password.trim() || await promptSecret('Superuser password: ');

if (!username || !secret) {
  throw new Error('Provide a username and password through arguments, environment variables, or the password prompt.');
}

if (secret.length < 12) {
  throw new Error('Superuser password must be at least 12 characters long.');
}

const existing = await db.accounts.findFirst({ where: { name: username } });
const passwordHash = await hashPassword(secret);
const data = {
  name: username,
  nickname: username,
  password: passwordHash,
  role: 'superadmin',
  loginType: '',
  image: existing?.image ?? '',
  apiToken: existing?.apiToken ?? '',
  note: existing?.note ?? 0,
  description: existing?.description ?? null,
  linkAccountId: existing?.linkAccountId ?? null,
};

if (existing) {
  await db.accounts.update({ where: { id: existing.id }, data });
  console.log(`Updated superuser "${username}" (id ${existing.id}).`);
} else {
  const created = await db.accounts.create({ data });
  console.log(`Created superuser "${username}" (id ${created.id}).`);
}

console.log('The password was hashed and is not stored or printed by this script.');
  process.exit(0);
