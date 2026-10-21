import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, relative, resolve } from 'node:path';
import { CompilationError, loadProject, validateTheme } from 'cross-doc';
import type { Diagnostic, LoadedProject } from 'cross-doc';
import { formatDiagnostics } from './diagnostics.js';

export interface ReadOptions {
	mode: 'inspect' | 'check';
	project: string;
	cwd: string;
	json: boolean;
	failOnWarning: boolean;
	checkPrince: boolean;
	theme?: string;
	include?: readonly string[];
	princeBinary?: string;
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function executable(path: string): Promise<string> {
	const canonical = await realpath(path);
	if (!(await stat(canonical)).isFile()) throw new Error('Prince executable is not a regular file');
	await access(canonical, constants.X_OK);
	return canonical;
}
async function findPrince(options: ReadOptions): Promise<string> {
	if (options.princeBinary) return executable(options.princeBinary);
	for (const directory of (process.env.PATH ?? '/usr/bin:/bin').split(delimiter)) {
		try {
			return await executable(
				resolve(
					options.cwd,
					directory || '.',
					process.platform === 'win32' ? 'prince.exe' : 'prince',
				),
			);
		} catch {
			/* Try the next PATH entry, without executing a shell or Prince. */
		}
	}
	throw new Error('Prince was not found on PATH');
}

export async function inspect(
	options: ReadOptions,
	io: { stdout: (text: string) => void; stderr: (text: string) => void },
): Promise<0 | 1> {
	let loaded: LoadedProject | null = null;
	let diagnostics: readonly Diagnostic[] = [];
	let error: string | null = null;
	let prince: { ok: true; path: string } | { ok: false; error: string } | null = null;
	try {
		loaded = await loadProject(
			{
				project: options.project,
				...(options.include === undefined ? {} : { include: options.include }),
			},
			{
				onDiagnostics: (items) => {
					diagnostics = items;
				},
			},
		);
		diagnostics = loaded.diagnostics;
		if (options.theme !== undefined) validateTheme(options.theme, loaded.themes);
	} catch (failure) {
		error = message(failure);
		if (failure instanceof CompilationError) diagnostics = failure.diagnostics;
	}
	if (options.checkPrince) {
		try {
			prince = { ok: true, path: await findPrince(options) };
		} catch (failure) {
			prince = { ok: false, error: message(failure) };
		}
	}
	diagnostics = [...diagnostics].sort(
		(a, b) => compare(a.source, b.source) || compare(a.target, b.target) || compare(a.code, b.code),
	);
	const warningFailure = options.failOnWarning && diagnostics.length > 0;
	const ok = error === null && prince?.ok !== false && !warningFailure;
	const result = {
		schemaVersion: 1,
		mode: options.mode,
		ok,
		project: loaded
			? {
					path: options.project,
					identity: relative(options.cwd, options.project) || '.',
					categories: loaded.categories.map(({ category, heading }) => ({ id: category, heading })),
					entries: loaded.entries
						.map(({ slug, title, type }) => ({ slug, title, category: type }))
						.sort((a, b) => compare(a.slug, b.slug)),
					themes: loaded.themes,
				}
			: null,
		diagnostics,
		prince,
		error,
		warningFailure,
	};
	if (options.json) io.stdout(JSON.stringify(result) + '\n');
	else {
		if (result.project && options.mode === 'inspect') {
			io.stdout(`Project: ${result.project.identity} (${options.project})\n`);
			io.stdout(
				'Categories:\n' +
					result.project.categories.map((item) => `  ${item.id}: ${item.heading}\n`).join(''),
			);
			io.stdout('Themes:\n' + result.project.themes.map((theme) => `  ${theme}\n`).join(''));
			io.stdout(
				'Entries:\n' +
					result.project.entries
						.map((item) => `  ${item.slug} [${item.category}]: ${item.title}\n`)
						.join(''),
			);
		}
		if (loaded && options.mode === 'check')
			io.stdout(`Checked ${loaded.entries.length} entries; ${diagnostics.length} link warnings.\n`);
		if (diagnostics.length) io.stderr(formatDiagnostics(diagnostics));
		if (error) io.stderr(`cross-doc: ${error}\n`);
		if (prince?.ok) io.stdout(`Prince available: ${prince.path}\n`);
		else if (prince) io.stderr(`cross-doc: Prince check failed: ${prince.error}\n`);
		if (warningFailure) io.stderr('cross-doc: Link warnings fail the check (--fail-on-warning)\n');
	}
	return ok ? 0 : 1;
}
