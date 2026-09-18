import path from 'path';

const BASE_DIR = process.cwd();

export const UPLOAD_FILE_PATH = path.join(BASE_DIR, '.planinc/files')
export const DBBAKUP_PATH = path.join(BASE_DIR, '.planinc/pgdump')
export const ROOT_PATH = path.join(BASE_DIR, '.planinc')
export const EXPORT_BAKUP_PATH = path.join(BASE_DIR, 'backup')
export const TEMP_PATH = path.join(BASE_DIR, '.planinc/files/temp')
export const VECTOR_PATH = path.join(BASE_DIR, '.planinc/vector')
