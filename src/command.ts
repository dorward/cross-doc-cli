import type { ReadOptions } from './inspect.js';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { basename, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { GenerateHtmlOptions, OutputOptions, LinkOptions } from 'cross-doc';

export interface CliOptions extends GenerateHtmlOptions, OutputOptions, LinkOptions {
	baseName: string;
	openPdf?: boolean;
}

export interface Diagnostics {
	stderr: (text: string) => void;
}

export interface CommandContext extends Diagnostics {
	cwd: string;
	stdout: (text: string) => void;
}

export type Compiler = (options: CliOptions, diagnostics: Diagnostics) => Promise<void>;
type ParseResult =
	| { kind: 'exit'; exitCode: 0 | 1 }
	| { kind: 'compile'; options: CliOptions }
	| { kind: 'read'; options: ReadOptions };

interface SuppliedOptions {
	openPdf?: boolean;
	inspect?: boolean;
	check?: boolean;
	json?: boolean;
	failOnWarning?: boolean;
	checkPrince?: boolean;
	project?: string;
	base_name?: string;
	html_file_name?: string;
	embedded_html_file_name?: string;
	pdf_file_name?: string;
	theme: string;
	include?: string[];
	prince_binary?: string;
}

const metadata: unknown = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
if (
	typeof metadata !== 'object' ||
	metadata === null ||
	!('version' in metadata) ||
	typeof metadata.version !== 'string'
) {
	throw new Error('Package metadata must contain a version string');
}
const version = metadata.version;

function includeSlugs(value: string): string[] {
	const slugs = value.split(',').map((slug) => slug.trim());
	if (slugs.some((slug) => !slug)) {
		throw new InvalidArgumentError('include must contain nonempty comma-separated slugs');
	}
	return slugs;
}

// argv contains user arguments only. Parsing does not inspect or change process.argv/cwd.
export function parseArguments(
	argv: readonly string[],
	{ cwd, stdout, stderr }: CommandContext,
): ParseResult {
	const program = new Command()
		.name('cross-doc')
		.description('Compile a trusted cross-doc project to HTML, PDF and embedded HTML.')
		.version(version, '-V, --version')
		.exitOverride()
		.configureOutput({ writeOut: stdout, writeErr: stderr })
		.allowExcessArguments(false)
		.option('--open-pdf', 'Open the completed PDF in the system viewer (compilation only)')
		.option('--inspect', 'Inspect entries, categories and themes without publishing')
		.option('--check', 'Validate project sources and links without publishing')
		.option('--json', 'Versioned JSON result (inspection/check only)')
		.option('--fail-on-warning', 'Exit 1 for link warnings (inspection/check only)')
		.option(
			'--check-prince',
			'Also check Prince availability without invoking it (inspection/check only)',
		)
		.option('-p, --project <directory>', 'Project directory (default: current directory)')
		.option('-b, --base_name <name>', 'Output basename (default: out/<project-directory-name>)')
		.option('-H, --html_file_name <file>', 'HTML output file')
		.option('-e, --embedded_html_file_name <file>', 'Embedded HTML output file')
		.option('-P, --pdf_file_name <file>', 'PDF output file')
		.option('-t, --theme <name>', 'Theme name', 'A5')
		.option(
			'-i, --include <items>',
			'Comma-separated library slugs (default: everything)',
			includeSlugs,
		)
		.option('--prince_binary <file>', 'Prince executable path (default: prince on PATH)')
		.addHelpText(
			'after',
			'\nRelative document paths use the project directory. Relative Prince paths use invocation cwd.\nNormal compilation generates all three outputs and requires Prince. Inspection/check do not write outputs or require Prince.',
		);

	try {
		program.parse([...argv], { from: 'user' });
	} catch (error) {
		if (!(error instanceof CommanderError)) throw error;
		return { kind: 'exit', exitCode: error.exitCode === 0 ? 0 : 1 };
	}

	const supplied = program.opts<SuppliedOptions>();
	const project = resolve(cwd, supplied.project ?? '.');

	const readMode = supplied.inspect || supplied.check;
	const invalid = (message: string): ParseResult => {
		stderr(`cross-doc: ${message}\n`);
		return { kind: 'exit', exitCode: 1 };
	};
	if (supplied.inspect && supplied.check) return invalid('Choose either --inspect or --check');
	if (!readMode && (supplied.json || supplied.failOnWarning || supplied.checkPrince))
		return invalid('--json, --fail-on-warning and --check-prince require --inspect or --check');
	if (readMode) {
		if (supplied.openPdf) return invalid('--open-pdf cannot be used with --inspect or --check');
		if (
			['base_name', 'html_file_name', 'pdf_file_name', 'embedded_html_file_name'].some(
				(key) => program.getOptionValueSource(key) === 'cli',
			)
		)
			return invalid('Output overrides cannot be used with --inspect or --check');
		if (supplied.prince_binary !== undefined && !supplied.checkPrince)
			return invalid('--prince_binary requires --check-prince in inspection/check mode');
		return {
			kind: 'read',
			options: {
				mode: supplied.inspect ? 'inspect' : 'check',
				project,
				cwd,
				json: supplied.json ?? false,
				failOnWarning: supplied.failOnWarning ?? false,
				checkPrince: supplied.checkPrince ?? false,
				...(program.getOptionValueSource('theme') === 'cli' ? { theme: supplied.theme } : {}),
				...(supplied.include === undefined ? {} : { include: supplied.include }),
				...(supplied.prince_binary === undefined
					? {}
					: { princeBinary: resolve(cwd, supplied.prince_binary) }),
			},
		};
	}
	const baseName = resolve(project, supplied.base_name ?? `out/${basename(project)}`);
	const options: CliOptions = {
		project,
		baseName,
		html_file_name: resolve(project, supplied.html_file_name ?? `${baseName}.html`),
		embedded_html_file_name: resolve(
			project,
			supplied.embedded_html_file_name ?? `${baseName}-complete.html`,
		),
		pdf_file_name: resolve(project, supplied.pdf_file_name ?? `${baseName}.pdf`),
		theme: supplied.theme,
	};
	if (supplied.openPdf) options.openPdf = true;
	if (supplied.include !== undefined) options.include = supplied.include;
	if (supplied.prince_binary !== undefined) {
		options.prince_binary = resolve(cwd, supplied.prince_binary);
	}
	return { kind: 'compile', options };
}

export async function runCommand(
	argv: readonly string[],
	{ cwd, stdout, stderr, compile }: CommandContext & { compile: Compiler },
): Promise<0 | 1> {
	try {
		const parsed = parseArguments(argv, { cwd, stdout, stderr });
		if (parsed.kind === 'exit') return parsed.exitCode;
		if (parsed.kind === 'read') {
			const { inspect } = await import('./inspect.js');
			return inspect(parsed.options, { stdout, stderr });
		}
		await compile(parsed.options, { stderr });
		return 0;
	} catch (error) {
		stderr(`cross-doc: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}
