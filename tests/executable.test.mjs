import { compileProject } from 'cross-doc';
import { afterEach, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const temporary = [];
afterEach(async () => {
	await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
	const project = await mkdtemp(join(tmpdir(), 'cross-doc-cli project é-'));
	temporary.push(project);
	await cp(new URL('./fixtures/project/', import.meta.url), project, { recursive: true });
	const prince = join(project, 'fake prince');
	await writeFile(
		prince,
		`#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
await new Promise(resolve => setTimeout(resolve, 30));
await writeFile(process.argv[process.argv.indexOf('-o') + 1], 'fake-pdf');
`,
		{ mode: 0o755 },
	);
	// Use .mjs for explicit ESM even outside the repository's package scope.
	await cp(prince, `${prince}.mjs`);
	return { project, prince: `${prince}.mjs` };
}

function run(argv, cwd, timeout = 15000) {
	const result = spawnSync(process.execPath, [executable, ...argv], {
		cwd,
		encoding: 'utf8',
		timeout,
		env: { ...process.env, TZ: 'UTC' },
	});
	expect(result.error).toBeUndefined();
	return result;
}

it.each([
	['--help', 'Usage:'],
	['--version', '2.0.0'],
])('executes %s without a valid project or Prince', (flag, text) => {
	const result = run(['-p', '/missing-cross-doc-project', flag]);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain(text);
	expect(result.stderr).toBe('');
});

it.each([
	['malformed YAML', 'data/alice.md', '---\ntitle: [unclosed\n---\n# Broken'],
	['invalid metadata', 'data/alice.md', '---\ntitle: 42\ntype: person\n---\n# Broken'],
	['malformed category JSON', 'data/categories.json', '{broken'],
	[
		'invalid category sort',
		'data/categories.json',
		'[{"category":"person","heading":"People","sort":"invalid"}]',
	],
])('returns 1 for %s with a single diagnostic', async (_name, file, contents) => {
	const { project, prince } = await fixture();
	await writeFile(join(project, file), contents);
	const result = run(['-p', project, '-t', 'default', '--prince_binary', prince]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
	expect(result.stderr).not.toContain('    at ');
	expect(result.stderr).not.toContain('Generating output');
});

it.each(['templates/index.html', 'resources/map.svg'])('returns 1 for missing %s', async (file) => {
	const { project, prince } = await fixture();
	await rm(join(project, file));
	const result = run(['-p', project, '-t', 'default', '--prince_binary', prince]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('ENOENT');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
});

it('reports a missing theme without silently substituting another theme', async () => {
	const { project, prince } = await fixture();
	const result = run(['-p', project, '-t', 'missing-theme', '--prince_binary', prince]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('missing-theme');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
});

it('returns 1 when the HTML destination cannot be written', async () => {
	const { project, prince } = await fixture();
	const destination = join(project, 'existing-directory');
	await mkdir(destination);
	const result = run([
		'-p',
		project,
		'-t',
		'default',
		'-H',
		destination,
		'--prince_binary',
		prince,
	]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('EISDIR');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
});

it('returns 1 when Prince is missing and preserves the earlier HTML output', async () => {
	const { project } = await fixture();
	const result = run([
		'-p',
		project,
		'-b',
		'out/book',
		'-t',
		'default',
		'--prince_binary',
		join(project, 'absent-prince'),
	]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('ENOENT');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
	expect(result.stderr).toContain(`Created HTML: ${join(project, 'out/book.html')}`);
	expect(result.stderr).toContain(
		`Not created PDF: ${join(project, 'out/book.pdf')} — compilation failed:`,
	);
	expect(result.stderr).toContain(
		`Not created Embedded HTML: ${join(project, 'out/book-complete.html')}`,
	);
	expect(await readFile(join(project, 'out/book.html'), 'utf8')).toContain('Alice');
});

it('compiles selected slugs from project cwd with independent output overrides', async () => {
	const { project, prince } = await fixture();
	const result = run(
		[
			'-i',
			' alice , bob ',
			'-t',
			'default',
			'-H',
			'html/custom.html',
			'-P',
			join(project, 'separate/book.pdf'),
			'-e',
			'embedded/custom.html',
			'--prince_binary',
			prince,
		],
		project,
	);
	expect(result.status).toBe(0);
	expect(result.stdout).toBe('');
	const html = await readFile(join(project, 'html/custom.html'), 'utf8');
	expect(html).toContain('id="alice"');
	expect(html).toContain('id="bob"');
	expect(html).not.toContain('id="arrival"');
	expect(html).not.toContain('Hidden Name');
	expect(await readFile(join(project, 'embedded/custom.html'), 'utf8')).toContain(
		'data:image/svg+xml;base64,',
	);
	expect(await readFile(join(project, 'separate/book.pdf'), 'utf8')).toBe('fake-pdf');
});

it('returns 1 when the real 30-second renderer timeout expires', async () => {
	const { project, prince } = await fixture();
	await writeFile(prince, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n');
	const started = Date.now();
	const result = run(['-p', project, '-t', 'default', '--prince_binary', prince], undefined, 40000);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
	expect(Date.now() - started).toBeGreaterThanOrEqual(29000);
}, 45000);

it('imports all compiled modules without starting the command', () => {
	const urls = ['index', 'command', 'compile', 'inspect', 'diagnostics', 'open-pdf'].map(
		(name) => new URL(`../dist/${name}.js`, import.meta.url).href,
	);
	const result = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`process.argv.push('--unknown'); for (const url of ${JSON.stringify(urls)}) await import(url);`,
		],
		{ encoding: 'utf8' },
	);
	expect(result.status).toBe(0);
	expect(result.stdout).toBe('');
	expect(result.stderr).toBe('');
});

it('writes HTML and embedded assets through the real library and waits for the fake renderer', async () => {
	const { project, prince } = await fixture();
	// Verify the library warning stays on stderr without a CLI stream redirect.
	const bob = join(project, 'data/bob.md');
	await writeFile(
		bob,
		(await readFile(bob, 'utf8')).replace('---', '---\nmonoDirectionalLinks: [ghost]'),
	);
	const result = run(
		['-p', project, '-b', 'out/book', '-t', 'default', '--prince_binary', prince],
		project,
	);
	await expect(readFile(join(project, 'test.dot'))).rejects.toMatchObject({ code: 'ENOENT' });
	await expect(readFile(join(project, 'out/test.dot'))).rejects.toMatchObject({ code: 'ENOENT' });
	expect(result.status).toBe(0);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('no such link exists');
	expect(result.stderr).toContain('Generating output');
	for (const label of ['CSS', 'HTML', 'PDF', 'Embedded HTML']) {
		expect(result.stderr).toContain(`Created ${label}:`);
	}
	const html = await readFile(join(project, 'out/book.html'), 'utf8');
	expect(html).toContain('href="#alice" title="Alice"');
	expect(html).toContain('The expedition map');
	const embedded = await readFile(join(project, 'out/book-complete.html'), 'utf8');
	expect(embedded).toContain(
		`data:image/svg+xml;base64,${(await readFile(join(project, 'resources/map.svg'))).toString('base64')}`,
	);
	expect(embedded).toContain(
		`data:text/css;base64,${(await readFile(join(project, 'templates/index.css'))).toString('base64')}`,
	);
	expect(await readFile(join(project, 'out/book.pdf'), 'utf8')).toBe('fake-pdf');
});

it('returns 1 with one concise diagnostic for missing input', () => {
	const result = run(['-p', '/missing-cross-doc-project']);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
	expect(result.stderr).toContain('ENOENT');
	expect(result.stderr).not.toContain('    at ');
});

it('returns 1 for invalid CLI arguments before compilation', () => {
	const result = run(['--include', 'alice,']);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('nonempty comma-separated slugs');
	expect(result.stderr).not.toContain('Getting files');
});

it('returns 1 when the renderer fails after HTML generation', async () => {
	const { project, prince } = await fixture();
	await writeFile(
		prince,
		'#!/usr/bin/env node\nprocess.stderr.write("renderer fixture failed"); process.exitCode = 7;\n',
	);
	const result = run(['-p', project, '-t', 'default', '--prince_binary', prince]);
	expect(result.status).toBe(1);
	expect(result.stdout).toBe('');
	expect(result.stderr).toContain('renderer fixture failed');
	expect(result.stderr.match(/cross-doc:/g)).toHaveLength(1);
	expect(result.stderr).not.toContain('    at ');
});

it('reports updated outputs on a second successful run', async () => {
	const { project, prince } = await fixture();
	const args = ['-p', project, '-b', 'out/book', '-t', 'default', '--prince_binary', prince];
	expect(run(args).status).toBe(0);
	const result = run(args);
	expect(result.status).toBe(0);
	for (const label of ['CSS', 'HTML', 'PDF', 'Embedded HTML'])
		expect(result.stderr).toContain(`Updated ${label}:`);
	expect(result.stdout).toBe('');
});

it('reports untouched existing files after rendering fails', async () => {
	const { project, prince } = await fixture();
	const args = ['-p', project, '-b', 'out/book', '-t', 'default', '--prince_binary', prince];
	expect(run(args).status).toBe(0);
	const embedded = await readFile(join(project, 'out/book-complete.html'), 'utf8');
	await writeFile(prince, '#!/usr/bin/env node\nprocess.exitCode = 7;\n');
	const result = run(args);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(`Updated HTML: ${join(project, 'out/book.html')}`);
	expect(result.stderr).toContain(
		`Not updated PDF: ${join(project, 'out/book.pdf')} — existing file retained; compilation failed:`,
	);
	expect(result.stderr).toContain(
		`Not updated Embedded HTML: ${join(project, 'out/book-complete.html')}`,
	);
	expect(await readFile(join(project, 'out/book.pdf'), 'utf8')).toBe('fake-pdf');
	expect(await readFile(join(project, 'out/book-complete.html'), 'utf8')).toBe(embedded);
});

it('reports a renderer-created partial PDF without claiming completion', async () => {
	const { project, prince } = await fixture();
	await writeFile(
		prince,
		`#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[process.argv.indexOf('-o') + 1], 'partial-pdf');
process.exitCode = 7;
`,
	);
	const result = run(['-p', project, '-b', 'out/book', '-t', 'default', '--prince_binary', prince]);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(`Created HTML: ${join(project, 'out/book.html')}`);
	expect(result.stderr).toContain(
		`Created PDF: ${join(project, 'out/book.pdf')} (run failed; file may be incomplete)`,
	);
	expect(result.stderr).toContain(
		`Not created Embedded HTML: ${join(project, 'out/book-complete.html')} — compilation failed:`,
	);
	expect(result.stdout).toBe('');
});

it.each(['TEST', 'out/deep/TEST'])(
	'rebases styles and images when basename is %s',
	async (baseName) => {
		const { project, prince } = await fixture();
		const result = run(['-p', project, '-b', baseName, '-t', 'default', '--prince_binary', prince]);
		expect(result.status).toBe(0);
		const html = await readFile(join(project, `${baseName}.html`), 'utf8');
		const prefix = baseName === 'TEST' ? '' : '../../';
		expect(html).toContain(`href="${prefix}templates/index.css"`);
		expect(html).toContain(`src="${prefix}resources/map.svg"`);
		const embedded = await readFile(join(project, `${baseName}-complete.html`), 'utf8');
		expect(embedded).toContain('data:image/svg+xml;base64,');
		expect(embedded).toContain('data:text/css;base64,');
	},
);

it('removes excluded one-way links and preserves them when both entries are selected', async () => {
	const { project, prince } = await fixture();
	const source = join(project, 'data/alice.md');
	await writeFile(
		source,
		(await readFile(source, 'utf8')).replace(
			'type: person',
			'type: person\nmonoDirectionalLinks: [bob]',
		),
	);
	for (const include of ['alice', 'alice,bob']) {
		const result = run([
			'-p',
			project,
			'-t',
			'default',
			'-b',
			'out/one-way',
			'-i',
			include,
			'--prince_binary',
			prince,
		]);
		expect(result.status).toBe(0);
		for (const filename of ['one-way.html', 'one-way-complete.html']) {
			const html = await readFile(join(project, 'out', filename), 'utf8');
			expect(html.includes('href="#bob"')).toBe(include === 'alice,bob');
			expect(html).toContain('Bob');
		}
	}
});

it.each([
	['unknown-only', 'ghost', ['ghost']],
	['mixed known and unknown', 'alice,ghost,missing', ['ghost', 'missing']],
	['duplicate', 'alice,alice', ['Duplicate']],
	['empty', '', ['nonempty']],
])(
	'rejects %s include selections without changing outputs or invoking Prince',
	async (_label, include, diagnostics) => {
		const { project, prince } = await fixture();
		await mkdir(join(project, 'out'), { recursive: true });
		const destinations = [
			'templates/index.css',
			'out/selection.html',
			'out/selection.pdf',
			'out/selection-complete.html',
		];
		for (const filename of destinations)
			await writeFile(join(project, filename), `retained ${filename}`);
		const marker = join(project, 'prince-invoked');
		await writeFile(
			prince,
			`#!/usr/bin/env node\nimport {writeFile} from 'node:fs/promises';\nawait writeFile(${JSON.stringify(marker)}, 'invoked');\nawait writeFile(process.argv[process.argv.indexOf('-o') + 1], 'fake-pdf');\n`,
		);
		const result = run([
			'-p',
			project,
			'-t',
			'default',
			'-b',
			'out/selection',
			'-i',
			include,
			'--prince_binary',
			prince,
		]);
		expect(result.status).toBe(1);
		for (const diagnostic of diagnostics) expect(result.stderr).toContain(diagnostic);
		for (const filename of destinations)
			expect(await readFile(join(project, filename), 'utf8')).toBe(`retained ${filename}`);
		await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
	},
);

it.each([{ include: undefined }, { include: ['alice'] }])(
	'matches the shared compiler for the same theme, paths and selection: %j',
	async ({ include }) => {
		const { project, prince } = await fixture();
		const args = ['-p', project, '-t', 'default', '-b', 'out/parity', '--prince_binary', prince];
		if (include) args.push('-i', include.join(','));
		const result = run(args);
		expect(result.status).toBe(0);
		const files = ['parity.html', 'parity.pdf', 'parity-complete.html'];
		const before = await Promise.all(files.map((file) => readFile(join(project, 'out', file))));
		await compileProject({
			project,
			theme: 'default',
			html_file_name: join(project, 'out/parity.html'),
			pdf_file_name: join(project, 'out/parity.pdf'),
			embedded_html_file_name: join(project, 'out/parity-complete.html'),
			prince_binary: prince,
			...(include ? { include } : {}),
		});
		for (let index = 0; index < files.length; index++)
			expect(await readFile(join(project, 'out', files[index]))).toEqual(before[index]);
	},
);
