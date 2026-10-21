import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCommand } from '../src/command.ts';

let project;
beforeEach(async () => {
	project = await realpath(await mkdtemp(join(tmpdir(), 'cli-inspect Ω-')));
	await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(project, { recursive: true, force: true });
});
function run(args) {
	const result = spawnSync(
		process.execPath,
		[new URL('../dist/index.js', import.meta.url).pathname, ...args],
		{ cwd: project, encoding: 'utf8', env: { ...process.env, PATH: '/no-prince' }, timeout: 10000 },
	);
	expect(result.error).toBeUndefined();
	return result;
}
async function tree(directory = project) {
	const result = {};
	for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		const path = join(directory, entry.name);
		result[entry.name] = entry.isDirectory()
			? await tree(path)
			: (await readFile(path)).toString('base64');
	}
	return result;
}
it('inspects categories, sorted slugs and themes without Prince or writes, with deterministic JSON', async () => {
	const before = await tree();
	const first = run(['--inspect', '--json']);
	expect(first.status).toBe(0);
	expect(first.stderr).toBe('');
	const result = JSON.parse(first.stdout);
	expect(result).toMatchObject({
		schemaVersion: 1,
		mode: 'inspect',
		ok: true,
		project: { path: project, identity: '.', themes: ['default'] },
		diagnostics: [],
		prince: null,
		error: null,
		warningFailure: false,
	});
	expect(result.project.entries.map((item) => item.slug)).toEqual([
		'alice',
		'arrival',
		'bob',
		'departure',
	]);
	expect(result.project.categories[0]).toEqual({ id: 'person', heading: 'People' });
	expect(run(['--inspect', '--json']).stdout).toBe(first.stdout);
	expect(await tree()).toEqual(before);
	const human = run(['--inspect']);
	expect(human.stdout).toContain('alice [person]: Alice');
	expect(human.stdout).toContain('default');
});
it('checks selected links and enforces the optional warning policy without writing files', async () => {
	const before = await tree();
	const result = run(['--check', '--include', 'alice', '--json']);
	expect(result.status).toBe(0);
	const value = JSON.parse(result.stdout);
	expect(value.diagnostics).toContainEqual({
		code: 'missing-link-target',
		severity: 'warning',
		source: 'alice',
		target: 'bob',
	});
	const strict = run(['--check', '--include', 'alice', '--json', '--fail-on-warning']);
	expect(strict.status).toBe(1);
	expect(strict.stderr).toBe('');
	expect(JSON.parse(strict.stdout)).toMatchObject({
		ok: false,
		warningFailure: true,
		diagnostics: value.diagnostics,
	});
	const human = run(['--check', '--include', 'alice']);
	expect(human.stdout).toContain('Checked 1 entries');
	expect(human.stderr).toContain('links to non-existent bob');
	expect(await tree()).toEqual(before);
});
it('allows no themes without a supplied theme, but rejects explicit missing or removed themes', async () => {
	await rm(join(project, 'templates/default'), { recursive: true });
	expect(run(['--check']).status).toBe(0);
	expect(JSON.parse(run(['--inspect', '--json']).stdout).project.themes).toEqual([]);
	const result = run(['--check', '--theme', 'default', '--json']);
	expect(result.status).toBe(1);
	expect(JSON.parse(result.stdout)).toMatchObject({
		ok: false,
		error: 'Unknown or unavailable theme: "default"',
	});
});
it.each([
	['unknown selection', ['--include', 'missing'], null, /Unknown|unknown/],
	['mixed selection', ['--include', 'alice,missing'], null, /Unknown|unknown/],
	['duplicate selection', ['--include', 'alice,alice'], null, /Duplicate|duplicate/],
	['malformed YAML', [], ['data/alice.md', '---\ntitle: [\n---\nBroken'], /parse|flow|YAML|line/],
	['malformed categories', [], ['data/categories.json', '{bad'], /JSON|categor/],
])('emits a single versioned failure result for %s', async (_name, args, change, pattern) => {
	if (change) await writeFile(join(project, change[0]), change[1]);
	const before = await tree();
	const result = run(['--check', '--json', ...args]);
	expect(result.status).toBe(1);
	expect(result.stderr).toBe('');
	expect(JSON.parse(result.stdout)).toMatchObject({
		schemaVersion: 1,
		mode: 'check',
		ok: false,
		error: expect.stringMatching(pattern),
	});
	expect(await tree()).toEqual(before);
});
it.each([
	['--check', '--inspect'],
	['--json'],
	['--fail-on-warning'],
	['--check-prince'],
	['--check', '-b', 'book'],
	['--inspect', '-H', 'page.html'],
	['--check', '-P', 'book.pdf'],
	['--check', '-e', 'embedded.html'],
	['--inspect', '--prince_binary', 'prince'],
	['--check', '--include', ''],
])('rejects conflicting or irrelevant options %j before loading or compiling', async (...args) => {
	const compile = vi.fn();
	const io = { cwd: project, stdout: vi.fn(), stderr: vi.fn(), compile };
	expect(await runCommand(args, io)).toBe(1);
	expect(compile).not.toHaveBeenCalled();
	expect(io.stdout).not.toHaveBeenCalled();
	expect(io.stderr).toHaveBeenCalled();
});
it('checks an explicit relative Prince executable without invoking it or changing project files', async () => {
	await writeFile(join(project, 'fake prince'), '#!/bin/sh\ntouch invoked\n', { mode: 0o755 });
	const before = await tree();
	const result = run(['--check', '--check-prince', '--prince_binary', 'fake prince', '--json']);
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout).prince).toEqual({
		ok: true,
		path: join(project, 'fake prince'),
	});
	expect(await tree()).toEqual(before);
	const missing = run(['--inspect', '--check-prince', '--json']);
	expect(missing.status).toBe(1);
	expect(JSON.parse(missing.stdout)).toMatchObject({
		ok: false,
		prince: { ok: false, error: 'Prince was not found on PATH' },
	});
});
it('searches PATH without executing Prince and rejects non-executable explicit files', async () => {
	const bin = join(project, 'bin');
	await mkdir(bin);
	await writeFile(join(bin, 'prince'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
	vi.stubEnv('PATH', bin);
	const io = { cwd: project, stdout: vi.fn(), stderr: vi.fn(), compile: vi.fn() };
	expect(await runCommand(['--check', '--json', '--check-prince'], io)).toBe(0);
	expect(JSON.parse(io.stdout.mock.calls[0][0]).prince.path).toBe(join(bin, 'prince'));
	await writeFile(join(project, 'not-executable'), 'no', { mode: 0o644 });
	const invalid = run(['--check', '--check-prince', '--prince_binary', 'not-executable', '--json']);
	expect(invalid.status).toBe(1);
	expect(JSON.parse(invalid.stdout).prince.ok).toBe(false);
});
