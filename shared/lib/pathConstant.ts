import path from 'path';

// Runtime data lives next to the process by default. `PLANINC_DATA_DIR` relocates
// the whole tree in one step — the e2e server uses it to keep uploads, backups and
// vectors inside its throwaway store instead of writing into the checkout.
const BASE_DIR = process.env.PLANINC_DATA_DIR
  ? path.resolve(process.env.PLANINC_DATA_DIR)
  : process.cwd();

export const UPLOAD_FILE_PATH = path.join(BASE_DIR, '.planinc/files')
export const DBBAKUP_PATH = path.join(BASE_DIR, '.planinc/pgdump')
export const ROOT_PATH = path.join(BASE_DIR, '.planinc')
export const EXPORT_BAKUP_PATH = path.join(BASE_DIR, 'backup')
export const TEMP_PATH = path.join(BASE_DIR, '.planinc/files/temp')
export const VECTOR_PATH = path.join(BASE_DIR, '.planinc/vector')
