import { chmod, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await rm(new URL('dist/', root), { recursive: true, force: true });
execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root))], {
	cwd: fileURLToPath(root),
	stdio: 'inherit',
});
await chmod(new URL('dist/index.js', root), 0o755);
