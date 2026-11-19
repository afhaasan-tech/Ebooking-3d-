/** Deletes the local embedded database so the next `npm run dev` re-migrates and re-seeds demo data. */
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.env.PGLITE_DATA_DIR || './.data/pglite');
if (!dir.includes('.data')) throw new Error(`Refusing to delete unexpected path: ${dir}`);
if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${dir}. Restart the API to re-seed demo data.`);
} else console.log('Nothing to reset.');
