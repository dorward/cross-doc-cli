import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pnpm = process.env.npm_execpath || 'pnpm';
// macOS /var aliases /private/var. Canonical paths prevent broken relative
// symlinks when pnpm globally registers a local directory.
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'cross-doc-cli-package-')));
const run = (command, args, cwd, environment = {}) =>
	execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, TZ: 'UTC', ...environment },
	});
try {
	const tarball = join(temporary, 'cli.tgz');
	// Packing must replace stale output through prepare, without test prebuilds.
	await mkdir(join(root, 'dist'), { recursive: true });
	await writeFile(join(root, 'dist', 'stale-marker.js'), 'stale');
	run(pnpm, ['pack', '--out', tarball, '--silent'], root);
	const files = run('tar', ['-tzf', tarball], root).trim().split('\n');
	assert(files.includes('package/dist/index.js'));
	assert(files.includes('package/dist/open-pdf.js'));
	assert(files.includes('package/node_modules/cross-doc/dist/index.js'));
	assert(!files.some((file) => file.endsWith('/stale-marker.js')));
	assert(
		files.every((file) =>
			/^package\/(?:dist\/|node_modules\/|package.json$|README.md$|LICENSE.md$)/.test(file),
		),
	);
	assert(
		!files.some((file) => /node_modules\/(?:typescript|vitest|@vitest|oxlint|oxfmt)\//.test(file)),
	);
	const packed = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json'], root));
	assert.equal(packed.bin['cross-doc'], './dist/index.js');
	assert.equal(packed.main, undefined);
	assert.equal(packed.scripts?.prepare, undefined);
	assert.equal(packed.dependencies['cross-doc'], 'file:../cross-doc');

	const consumer = join(temporary, 'consumer');
	await mkdir(consumer);
	await writeFile(
		join(consumer, 'package.json'),
		JSON.stringify({
			name: 'cli-package-consumer',
			private: true,
			dependencies: { 'cross-doc-cli': `file:${tarball}` },
		}),
	);
	// No sibling checkout, compiler, dependency build permissions, or install scripts.
	run(pnpm, ['install', '--ignore-scripts'], consumer);
	const installed = join(consumer, 'node_modules/cross-doc-cli');
	assert((await stat(join(installed, 'dist/index.js'))).mode & 0o111);
	assert(
		(await readFile(join(installed, 'dist/index.js'), 'utf8')).startsWith('#!/usr/bin/env node\n'),
	);
	const binary = join(consumer, 'node_modules/.bin/cross-doc');
	assert.match(run(binary, ['--help'], consumer), /Usage: cross-doc/);
	assert.match(run(binary, ['--help'], consumer), /--open-pdf/);
	assert.equal(run(binary, ['--version'], consumer).trim(), packed.version);

	const project = join(temporary, 'document project');
	await cp(new URL('./fixtures/project/', import.meta.url), project, { recursive: true });

	const inspection = JSON.parse(run(binary, ['--inspect', '--json', '-p', project], consumer));
	assert.equal(inspection.schemaVersion, 1);
	assert.equal(inspection.ok, true);
	assert.equal(inspection.project.entries.length, 4);
	const check = JSON.parse(run(binary, ['--check', '--json', '-p', project], consumer));
	assert.equal(check.ok, true);
	assert.equal(check.prince, null);
	const prince = join(temporary, 'fake-prince.mjs');
	await writeFile(
		prince,
		`#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
await writeFile(process.argv[process.argv.indexOf('-o') + 1], 'fake-pdf');
`,
		{ mode: 0o755 },
	);
	assert.equal(
		run(
			binary,
			['-p', project, '-b', 'out/book', '-t', 'default', '--prince_binary', prince],
			consumer,
		),
		'',
	);
	assert.match(await readFile(join(project, 'out/book.html'), 'utf8'), /title="Alice"/);
	assert.equal(
		await readFile(join(project, 'out/book.html'), 'utf8'),
		await readFile(new URL('./expected/document.html', import.meta.url), 'utf8'),
	);
	assert.match(
		await readFile(join(project, 'out/book-complete.html'), 'utf8'),
		/data:image\/svg\+xml;base64,/,
	);
	assert.equal(await readFile(join(project, 'out/book.pdf'), 'utf8'), 'fake-pdf');
	async function checkGlobalInstallation(arguments_, cwd, label) {
		const pnpmHome = join(temporary, label);
		await mkdir(join(pnpmHome, 'bin'), { recursive: true });
		const environment = {
			PNPM_HOME: pnpmHome,
			PATH: `${join(pnpmHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
			CI: 'true',
		};
		run(
			pnpm,
			['install', '-g', ...arguments_, '--state-dir', join(temporary, `${label}-state`)],
			cwd,
			environment,
		);
		const executable = join(pnpmHome, 'bin', 'cross-doc');
		assert.match(run(executable, ['--help'], temporary, environment), /Usage: cross-doc/);
		assert.equal(run(executable, ['--version'], temporary, environment).trim(), packed.version);
		assert.equal(
			run(
				executable,
				['-p', project, '-b', `out/${label}`, '-t', 'default', '--prince_binary', prince],
				temporary,
				environment,
			),
			'',
		);
		assert.equal(
			await readFile(join(project, `out/${label}.html`), 'utf8'),
			await readFile(new URL('./expected/document.html', import.meta.url), 'utf8'),
		);
		assert.equal(await readFile(join(project, `out/${label}.pdf`), 'utf8'), 'fake-pdf');
	}
	// Both routes use disposable pnpm homes, not the user's global installation.
	await checkGlobalInstallation([tarball], temporary, 'global-archive');
	await checkGlobalInstallation(['.'], root, 'global-checkout');
	const failure = (argv) => {
		const result = spawnSync(binary, argv, { cwd: consumer, encoding: 'utf8', timeout: 15000 });
		assert.ifError(result.error);
		assert.equal(result.status, 1);
		assert.equal(result.stdout, '');
		assert(!result.stderr.includes('    at '));
		return result.stderr;
	};
	assert.match(failure(['--include', 'alice,']), /nonempty comma-separated slugs/);
	assert.match(failure(['-p', join(temporary, 'missing-project')]), /ENOENT/);
	assert.match(
		failure(['-p', project, '-t', 'default', '--prince_binary', join(temporary, 'missing-prince')]),
		/ENOENT/,
	);
	await writeFile(join(project, 'data/alice.md'), '---\ntitle: [unclosed\n---\n# Broken');
	assert.equal((failure(['-p', project, '-t', 'default']).match(/cross-doc:/g) || []).length, 1);
	console.log(
		'Packed command: fresh ESM, executable bin, bundled library, local/global installs and fixture compilation pass.',
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
