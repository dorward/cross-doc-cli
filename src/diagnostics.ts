import type { Diagnostic } from 'cross-doc';

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
	let report = '';
	let source: string | undefined;
	for (const diagnostic of diagnostics) {
		if (diagnostic.code === 'unused-one-way-link') {
			report += `${diagnostic.source} is marked as monoDirectionalLinks: ${diagnostic.target} but no such link exists\n`;
			continue;
		}
		if (source !== diagnostic.source) {
			source = diagnostic.source;
			report += `Report for links from ${source}:\n`;
		}
		report +=
			diagnostic.code === 'missing-link-target'
				? `\tlinks to non-existent ${diagnostic.target}\n`
				: `\tmissing reciprocal link from ${diagnostic.target}\n`;
	}
	return report;
}
