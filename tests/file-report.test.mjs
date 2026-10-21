import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plannedFiles, fileReport } from '../src/file-report.ts';

const temporary = [];
afterEach(async () => {
	await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
	const project = await mkdtemp(join(tmpdir(), 'cross-doc-report-'));
	temporary.push(project);
	await mkdir(join(project, 'templates'));
	const options = {
		project,
		html_file_name: join(project, 'book.html'),
		pdf_file_name: join(project, 'book.pdf'),
		embedded_html_file_name: join(project, 'embedded.html'),
	};
	return { project, options };
}
it('does not infer an update from a successful phase with an unchanged existing file', async () => {
	const { options } = await fixture();
	await writeFile(options.html_file_name, 'existing');
	const files = await plannedFiles(options);
	const report = await fileReport(files, undefined, [
		{ kind: 'html', path: options.html_file_name, status: 'completed' },
	]);
	expect(report).toContain('Not updated HTML:');
	expect(report).toContain('no filesystem change observed');
	expect(report.split('\n').find((line) => line.includes('Not updated HTML:'))).not.toContain(
		'file was not found',
	);
});
it('uses phase completion to avoid marking completed CSS as partial after a later failure', async () => {
	const { project, options } = await fixture();
	const files = await plannedFiles(options);
	const css = join(project, 'templates/index.css');
	await writeFile(css, 'completed CSS');
	await writeFile(options.html_file_name, 'partial HTML');
	const report = await fileReport(files, { error: new Error('Prince failed') }, [
		{ kind: 'css', path: css, status: 'completed' },
		{ kind: 'html', path: options.html_file_name, status: 'unverified' },
	]);
	expect(report).toContain(`Created CSS: ${css}\n`);
	expect(report).toContain(
		`Created HTML: ${options.html_file_name} (run failed; file may be incomplete)`,
	);
	expect(report).toContain('Not created PDF:');
});
it('does not credit a change to an artifact that was not attempted, or use a mismatched path fact', async () => {
	const { options } = await fixture();
	const files = await plannedFiles(options);
	await writeFile(options.html_file_name, 'external change');
	const failure = { error: new Error('Selection failed') };
	const report = await fileReport(files, failure, [
		{ kind: 'html', path: options.html_file_name, status: 'not-started' },
	]);
	expect(report).toContain('file changed although this invocation did not attempt it');
	const mismatched = await fileReport(files, failure, [
		{ kind: 'html', path: join(options.project, 'elsewhere.html'), status: 'completed' },
	]);
	expect(mismatched).toContain('(run failed; file may be incomplete)');
});
