import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const temp = fileURLToPath(new URL('../node_modules/.cache/tb-tests/tmp/', import.meta.url));
mkdirSync(temp, { recursive: true });
const watch = process.argv.includes('--watch');
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    watch ? '--watch' : 'run',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
