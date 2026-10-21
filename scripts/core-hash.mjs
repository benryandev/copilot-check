// Writes core/VERSION = sha256 over the sorted core/*.js files, so a copy of core/ elsewhere can prove it is unchanged.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export function coreHash(dir) {
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) h.update(f + '\0' + readFileSync(join(dir, f), 'utf8') + '\0');
  return h.digest('hex');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'core');
  const v = coreHash(dir); writeFileSync(join(dir, 'VERSION'), v + '\n'); console.log('core', v.slice(0, 12));
}
