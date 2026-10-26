import type { Diagnostic } from 'cross-doc';

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
	let report = '';
	let source: string | undefined;
	for (const diagnostic of diagnostics) {
		if (diagnostic.code === 'legacy-reference') {
			report += `${diagnostic.source} uses legacy reference: ${diagnostic.target}\n`;
			continue;
		}
		if (
			[
				'ambiguous-link-target',
				'unsupported-link-syntax',
				'missing-heading-target',
				'non-published-link-target',
				'excluded-link-target',
			].includes(diagnostic.code)
		) {
			const labels: Partial<Record<Diagnostic['code'], string>> = {
				'ambiguous-link-target': 'ambiguous target',
				'unsupported-link-syntax': 'unsupported link syntax',
				'missing-heading-target': 'missing heading',
				'non-published-link-target': 'target is outside the published collection',
				'excluded-link-target': 'target is excluded from this output',
			};
			report += `${diagnostic.source}: ${labels[diagnostic.code]}: ${diagnostic.target}${diagnostic.candidates ? ` (candidates: ${diagnostic.candidates.join(', ')})` : ''}\n`;
			continue;
		}
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
