import { afterEach, expect, it, vi } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/open-pdf.ts', () => ({ openPdf: vi.fn().mockResolvedValue(undefined) }));
import { openPdf } from '../src/open-pdf.ts';

vi.mock('cross-doc', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		compileProject: vi.fn().mockImplementation(async (_options, hooks) => {
			hooks.onProgress({ stage: 'output', status: 'started' });
			hooks.onProgress({ stage: 'output', status: 'completed' });
			return { artifacts: [] };
		}),
	};
});
import { compileProject } from 'cross-doc';
import { compile } from '../src/compile.ts';
import { parseArguments } from '../src/command.ts';

const temporary = [];
afterEach(async () => {
	await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	vi.clearAllMocks();
});
async function fixture() {
	const project = await mkdtemp(join(tmpdir(), 'cross-doc-cli-pipeline-'));
	temporary.push(project);
	await cp(new URL('./fixtures/project/', import.meta.url), project, { recursive: true });
	const stderr = vi.fn();
	const parsed = parseArguments(['-t', 'default'], { cwd: project, stdout: vi.fn(), stderr });
	expect(parsed.kind).toBe('compile');
	return { options: parsed.options, stderr };
}

it('delegates unchanged options to the library while retaining progress and file-report presentation', async () => {
	const { options, stderr } = await fixture();
	await compile(options, { stderr });
	expect(compileProject).toHaveBeenCalledExactlyOnceWith(options, {
		onProgress: expect.any(Function),
		onDiagnostics: expect.any(Function),
	});
	expect(stderr.mock.calls.flat().join('')).toContain('Generating output....\n');
	expect(stderr.mock.calls.filter(([text]) => text === 'Generating output....\n')).toHaveLength(1);
	expect(stderr.mock.calls.at(-1)[0]).toContain('Files:\n');
});
it('waits for library compilation and propagates its later rejection', async () => {
	let reject;
	compileProject.mockImplementationOnce(
		() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
	);
	const { options, stderr } = await fixture();
	let finished = false;
	const pending = compile(options, { stderr }).finally(() => {
		finished = true;
	});
	const assertion = expect(pending).rejects.toThrow('Renderer failed later');
	expect(finished).toBe(false);
	// File inspection is asynchronous before the library is called.
	await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
	reject(new Error('Renderer failed later'));
	await assertion;
	expect(stderr.mock.calls.at(-1)[0]).toContain('compilation failed: Renderer failed later');
});
it('propagates library failures without hiding the original message', async () => {
	compileProject.mockRejectedValueOnce(new Error('Duplicate slug'));
	const { options, stderr } = await fixture();
	await expect(compile(options, { stderr })).rejects.toThrow('Duplicate slug');
	expect(stderr.mock.calls.at(-1)[0]).toContain('compilation failed: Duplicate slug');
});
it('rejects an explicit empty selection even when argument parsing is bypassed', async () => {
	const actual = await vi.importActual('cross-doc');
	compileProject.mockImplementationOnce(actual.compileProject);
	const { options, stderr } = await fixture();
	await expect(compile({ ...options, include: [] }, { stderr })).rejects.toThrow('nonempty slugs');
});

it('writes link diagnostics only to the injected sink, including before a later failure', async () => {
	const { options, stderr } = await fixture();
	const processStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	compileProject.mockImplementationOnce(async (_options, hooks) => {
		hooks.onDiagnostics([
			{ code: 'unused-one-way-link', severity: 'warning', source: 'alice', target: 'unused' },
			{ code: 'missing-link-target', severity: 'warning', source: 'alice', target: 'missing' },
			{ code: 'missing-reciprocal-link', severity: 'warning', source: 'bob', target: 'alice' },
		]);
		throw new Error('Prince failed');
	});
	try {
		await expect(compile(options, { stderr })).rejects.toThrow('Prince failed');
		expect(stderr.mock.calls.flat().join('')).toContain(
			'alice is marked as monoDirectionalLinks: unused but no such link exists\nReport for links from alice:\n\tlinks to non-existent missing\nReport for links from bob:\n\tmissing reciprocal link from alice\n',
		);
		expect(processStderr).not.toHaveBeenCalled();
	} finally {
		processStderr.mockRestore();
	}
});

it('opens exactly once only after all compilation output has completed', async () => {
	const { options, stderr } = await fixture();
	let finish;
	compileProject.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = compile({ ...options, openPdf: true }, { stderr });
	await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
	expect(openPdf).not.toHaveBeenCalled();
	finish({ artifacts: [{ kind: 'pdf', path: options.pdf_file_name, status: 'completed' }] });
	await pending;
	expect(openPdf).toHaveBeenCalledExactlyOnceWith(options.pdf_file_name);
	expect(compileProject.mock.calls.at(-1)[0]).not.toHaveProperty('openPdf');
});
it('does not open by default or after a failed compilation', async () => {
	const { options, stderr } = await fixture();
	await compile(options, { stderr });
	expect(openPdf).not.toHaveBeenCalled();
	compileProject.mockRejectedValueOnce(new Error('Prince failed'));
	await expect(compile({ ...options, openPdf: true }, { stderr })).rejects.toThrow('Prince failed');
	expect(openPdf).not.toHaveBeenCalled();
});
it('preserves compilation success and prints the saved path when opening fails', async () => {
	const { options, stderr } = await fixture();
	compileProject.mockResolvedValueOnce({
		artifacts: [{ kind: 'pdf', path: options.pdf_file_name, status: 'completed' }],
	});
	openPdf.mockRejectedValueOnce(new Error('Viewer unavailable'));
	await expect(compile({ ...options, openPdf: true }, { stderr })).resolves.toBeUndefined();
	expect(stderr.mock.calls.at(-1)[0]).toContain(
		`PDF saved at ${options.pdf_file_name}; could not open it: Viewer unavailable`,
	);
});
it('does not launch an unverified or unexpected returned PDF', async () => {
	const { options, stderr } = await fixture();
	for (const artifact of [
		{ kind: 'pdf', path: options.pdf_file_name, status: 'unverified' },
		{ kind: 'pdf', path: '/wrong.pdf', status: 'completed' },
	]) {
		compileProject.mockResolvedValueOnce({ artifacts: [artifact] });
		await compile({ ...options, openPdf: true }, { stderr });
	}
	expect(openPdf).not.toHaveBeenCalled();
});

it('returns exit 0 when only opening fails and leaves stdout empty', async () => {
	const { runCommand } = await import('../src/command.ts');
	const { options, stderr } = await fixture();
	const stdout = vi.fn();
	compileProject.mockResolvedValueOnce({
		artifacts: [{ kind: 'pdf', path: options.pdf_file_name, status: 'completed' }],
	});
	openPdf.mockRejectedValueOnce(new Error('Launcher unavailable'));
	expect(
		await runCommand(['--open-pdf', '-t', 'default'], {
			cwd: options.project,
			stdout,
			stderr,
			compile,
		}),
	).toBe(0);
	expect(stdout).not.toHaveBeenCalled();
	expect(stderr.mock.calls.at(-1)[0]).toContain('could not open it: Launcher unavailable');
});
