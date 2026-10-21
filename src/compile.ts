import { openPdf } from './open-pdf.js';
import { resolve } from 'node:path';
import { formatDiagnostics } from './diagnostics.js';
import { compileProject, CompilationError } from 'cross-doc';
import type { CompilationResult, CompilationStage } from 'cross-doc';
import type { CliOptions, Diagnostics } from './command.js';
import { fileReport, plannedFiles } from './file-report.js';

export async function compile(options: CliOptions, { stderr }: Diagnostics): Promise<void> {
	const { openPdf: shouldOpen, ...compilationOptions } = options;
	const files = await plannedFiles(options);
	let result: CompilationResult;
	try {
		result = await compileProject(compilationOptions, {
			onDiagnostics: (diagnostics) => stderr(formatDiagnostics(diagnostics)),
			onProgress: ({ stage, status }) => {
				if (status === 'started') stderr(`${messages[stage]}....\n`);
			},
		});
	} catch (error) {
		stderr(
			await fileReport(files, { error }, error instanceof CompilationError ? error.artifacts : []),
		);
		throw error;
	}
	stderr(await fileReport(files, undefined, result.artifacts));
	if (shouldOpen) {
		const pdf = result.artifacts.find(
			(item) =>
				item.kind === 'pdf' &&
				item.status === 'completed' &&
				item.path === resolve(options.pdf_file_name),
		);
		if (!pdf) {
			stderr(
				`cross-doc: Could not open PDF at ${resolve(options.pdf_file_name)}: compilation did not report a completed PDF at this destination\n`,
			);
			return;
		}
		try {
			await openPdf(pdf.path);
		} catch (error) {
			const reason = error instanceof Error ? error.message.split('\n')[0] : 'Viewer launch failed';
			stderr(
				`cross-doc: PDF saved at ${resolve(options.pdf_file_name)}; could not open it: ${reason}\n`,
			);
		}
	}
}

const messages: Record<CompilationStage, string> = {
	discover: 'Getting files',
	read: 'Reading files',
	parse: 'Parsing data',
	clean: 'Cleaning HTML',
	metadata: 'Adding front matter',
	links: 'Checking links',
	sort: 'Sorting data',
	render: 'Generating HTML',
	placeholders: 'Replacing placeholders',
	toc: 'Building table of contents',
	titles: 'Adding title attributes',
	output: 'Generating output',
};
