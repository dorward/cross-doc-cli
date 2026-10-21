import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url));

it.skipIf(process.env.CROSS_DOC_TEST_PRINCE !== '1').each(['out/document', 'document'])(
	'renders styled CLI output at %s with real Prince and verifies pagination',
	async (baseName) => {
		const project = await mkdtemp(join(tmpdir(), 'cross-doc-cli-pdf-'));
		try {
			await cp(new URL('./fixtures/project/', import.meta.url), project, { recursive: true });
			const { stdout } = await exec(
				process.execPath,
				[executable, '-p', project, '-t', 'default', '-b', baseName],
				{
					env: { ...process.env, TZ: 'UTC' },
					timeout: 40000,
				},
			);
			expect(stdout).toBe('');
			const pdf = join(project, `${baseName}.pdf`);
			expect((await readFile(pdf)).subarray(0, 5).toString()).toBe('%PDF-');
			const { stdout: info } = await exec('pdfinfo', [pdf]);
			expect(info).toMatch(/Pages:\s+4\b/);
			expect(info).toMatch(/Page size:\s+595\.?\d* x 841\.?\d* pts \(A4\)/);
			const { stdout: text } = await exec('pdftotext', ['-layout', pdf, '-']);
			const pages = text.split('\f');
			expect(pages[0]).toContain('The expedition map');
			expect(pages[1]).toContain('The journey begins.');
			expect(pages[2]).toContain('Hero Points');
			expect(pages[3]).toContain('1st February 2020');
			for (const expected of ['Alice', 'Bob', 'Finds the way home.'])
				expect(text).toContain(expected);
			if (process.env.CROSS_DOC_PDF_ARTIFACTS) {
				const artifacts = resolve(
					process.env.CROSS_DOC_PDF_ARTIFACTS,
					baseName === 'document' ? 'project-root' : 'out-directory',
				);
				await mkdir(artifacts, { recursive: true });
				for (const extension of ['.html', '.pdf', '-complete.html']) {
					await cp(
						join(project, `${baseName}${extension}`),
						join(artifacts, `document${extension}`),
					);
				}
				await exec('pdftoppm', ['-scale-to', '1200', '-png', pdf, join(artifacts, 'page')]);
			}
		} finally {
			await rm(project, { recursive: true, force: true });
		}
	},
	45000,
);
