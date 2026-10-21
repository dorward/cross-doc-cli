import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArguments, runCommand } from '../src/command.ts';

const cwd = resolve('invocation');
const project = resolve(cwd, '../A project é');

function context(compile = vi.fn().mockResolvedValue(undefined)) {
	return { cwd, stdout: vi.fn(), stderr: vi.fn(), compile };
}

function options(argv = [], invocation = cwd) {
	const io = context();
	const result = parseArguments(argv, { ...io, cwd: invocation });
	expect(result.kind).toBe('compile');
	expect(io.stdout).not.toHaveBeenCalled();
	expect(io.stderr).not.toHaveBeenCalled();
	return result.options;
}

describe('project and output paths', () => {
	it('defaults to cwd, A5 and all three outputs, with absent optional fields omitted', () => {
		expect(options()).toEqual({
			project: cwd,
			baseName: resolve(cwd, 'out/invocation'),
			html_file_name: resolve(cwd, 'out/invocation.html'),
			embedded_html_file_name: resolve(cwd, 'out/invocation-complete.html'),
			pdf_file_name: resolve(cwd, 'out/invocation.pdf'),
			theme: 'A5',
		});
	});

	it.each(['../A project é', `${project}/`, project])(
		'derives defaults from selected project %s',
		(selected) => {
			const result = options(['--project', selected]);
			expect(result.project).toBe(project);
			expect(result.baseName).toBe(resolve(project, 'out/A project é'));
			expect(result.pdf_file_name).toBe(resolve(project, 'out/A project é.pdf'));
		},
	);

	it.each(['reports/book', resolve('external/book')])(
		'resolves basename %s and independent overrides',
		(base) => {
			const result = options(['-p', project, '-b', base, '--html_file_name', 'custom/page.html']);
			expect(result.baseName).toBe(resolve(project, base));
			expect(result.html_file_name).toBe(resolve(project, 'custom/page.html'));
			expect(result.pdf_file_name).toBe(`${resolve(project, base)}.pdf`);
			expect(result.embedded_html_file_name).toBe(`${resolve(project, base)}-complete.html`);
		},
	);

	it('preserves absolute output overrides and resolves relative overrides against project', () => {
		const html = resolve('external/page.html');
		const result = options([
			'-p',
			project,
			'-H',
			html,
			'-P',
			'pdf/book.pdf',
			'-e',
			'embedded/book.html',
		]);
		expect(result.html_file_name).toBe(html);
		expect(result.pdf_file_name).toBe(resolve(project, 'pdf/book.pdf'));
		expect(result.embedded_html_file_name).toBe(resolve(project, 'embedded/book.html'));
	});

	it('keeps all existing long options and supports nonconflicting short aliases', () => {
		const long = [
			'--project',
			project,
			'--base_name',
			'report',
			'--html_file_name',
			'a.html',
			'--embedded_html_file_name',
			'b.html',
			'--pdf_file_name',
			'c.pdf',
			'--theme',
			'default',
			'--include',
			' alice, bob ',
		];
		const short = [
			'-p',
			project,
			'-b',
			'report',
			'-H',
			'a.html',
			'-e',
			'b.html',
			'-P',
			'c.pdf',
			'-t',
			'default',
			'-i',
			' alice, bob ',
		];
		expect(options(long)).toEqual(options(short));
		expect(options(short)).toMatchObject({ theme: 'default', include: ['alice', 'bob'] });
	});

	it.each(['tools/my prince', resolve('external/prince')])(
		'resolves explicit Prince path %s from invocation cwd',
		(executable) => {
			expect(options(['-p', project, '--prince_binary', executable]).prince_binary).toBe(
				resolve(cwd, executable),
			);
		},
	);
});

describe('command lifecycle and streams', () => {
	it.each(['--help', '-h'])('%s works without compiler, project files or Prince', async (flag) => {
		const io = context();
		expect(await runCommand([flag], io)).toBe(0);
		expect(io.compile).not.toHaveBeenCalled();
		expect(io.stderr).not.toHaveBeenCalled();
		const help = io.stdout.mock.calls.flat().join('');
		for (const option of [
			'-p, --project',
			'-H, --html_file_name',
			'-P, --pdf_file_name',
			'--prince_binary',
		]) {
			expect(help).toContain(option);
		}
	});

	it.each(['--version', '-V'])('%s reports package version without compilation', async (flag) => {
		const io = context();
		const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
		expect(await runCommand([flag], io)).toBe(0);
		expect(io.stdout.mock.calls.flat().join('')).toBe(`${version}\n`);
		expect(io.stderr).not.toHaveBeenCalled();
		expect(io.compile).not.toHaveBeenCalled();
	});

	it.each([
		[['--unknown'], 'unknown option'],
		[['unexpected'], 'too many arguments'],
		...[
			'--project',
			'--base_name',
			'--html_file_name',
			'--embedded_html_file_name',
			'--pdf_file_name',
			'--theme',
			'--include',
			'--prince_binary',
		].map((flag) => [[flag], 'argument missing']),
		...['', ' ', ',alice', 'alice,', 'alice, ,bob'].map((value) => [
			['-i', value],
			'nonempty comma-separated slugs',
		]),
	])('rejects %j once on stderr without compiling', async (argv, message) => {
		const io = context();
		expect(await runCommand(argv, io)).toBe(1);
		expect(io.compile).not.toHaveBeenCalled();
		expect(io.stdout).not.toHaveBeenCalled();
		expect(io.stderr).toHaveBeenCalledTimes(1);
		expect(io.stderr.mock.calls[0][0]).toContain(message);
		expect(io.stderr.mock.calls[0][0]).not.toContain(' at ');
	});

	it('awaits compilation and sends progress/warnings to stderr, leaving stdout empty', async () => {
		let complete;
		const io = context(
			vi.fn(async (_options, { stderr }) => {
				stderr('Compiling…\n');
				stderr('Warning: missing reciprocal link\n');
				await new Promise((resolve) => {
					complete = resolve;
				});
			}),
		);
		let finished = false;
		const result = runCommand([], io).then((code) => {
			finished = true;
			return code;
		});
		await Promise.resolve();
		expect(finished).toBe(false);
		complete();
		expect(await result).toBe(0);
		expect(io.stdout).not.toHaveBeenCalled();
		expect(io.stderr.mock.calls.flat()).toEqual([
			'Compiling…\n',
			'Warning: missing reciprocal link\n',
		]);
	});

	it.each(['Missing project', 'Invalid YAML', 'Prince failed'])(
		'reports asynchronous %s once without stack',
		async (message) => {
			const io = context(vi.fn().mockRejectedValue(new Error(message)));
			expect(await runCommand([], io)).toBe(1);
			expect(io.stderr).toHaveBeenCalledExactlyOnceWith(`cross-doc: ${message}\n`);
			expect(io.stdout).not.toHaveBeenCalled();
		},
	);

	it('reports a synchronous compiler failure', async () => {
		const io = context(() => {
			throw new Error('Invalid metadata');
		});
		expect(await runCommand([], io)).toBe(1);
		expect(io.stderr).toHaveBeenCalledExactlyOnceWith('cross-doc: Invalid metadata\n');
	});

	it('can be imported without argument parsing, output, or compilation side effects', () => {
		const result = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`process.argv.push('--unknown'); await import(${JSON.stringify(new URL('../src/command.ts', import.meta.url).href)});`,
			],
			{ encoding: 'utf8' },
		);
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('');
	});
});

it('makes PDF opening explicit and rejects it in read-only modes', () => {
	expect(options(['--open-pdf']).openPdf).toBe(true);
	expect(options(['--open-pdf', '-P', 'reports/My book Ω.pdf']).pdf_file_name).toBe(
		resolve(cwd, 'reports/My book Ω.pdf'),
	);
	expect(options()).not.toHaveProperty('openPdf');
	for (const flag of ['--check', '--inspect']) {
		const io = context();
		expect(parseArguments([flag, '--open-pdf'], io)).toEqual({ kind: 'exit', exitCode: 1 });
		expect(io.stderr.mock.calls.flat().join('')).toContain('--open-pdf cannot be used');
		expect(io.compile).not.toHaveBeenCalled();
	}
});
