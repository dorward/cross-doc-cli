import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CompilationArtifact } from 'cross-doc';
import type { CliOptions } from './command.js';

interface FileState {
	file: boolean;
	fingerprint: string;
}

type Inspection = { kind: 'known'; state: FileState | null } | { kind: 'unknown'; reason: string };
interface PlannedFile {
	kind: CompilationArtifact['kind'];
	label: string;
	path: string;
	before: Inspection;
}

function message(error: unknown): string {
	return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
}

async function inspect(path: string): Promise<Inspection> {
	try {
		const info = await stat(path, { bigint: true });
		return {
			kind: 'known',
			state: {
				file: info.isFile(),
				fingerprint: `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`,
			},
		};
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error.code === 'ENOENT' || error.code === 'ENOTDIR')
		) {
			return { kind: 'known', state: null };
		}
		return { kind: 'unknown', reason: message(error) };
	}
}

export async function plannedFiles(options: CliOptions): Promise<PlannedFile[]> {
	const files: { kind: CompilationArtifact['kind']; label: string; path: string }[] = [
		{ kind: 'css', label: 'CSS', path: resolve(options.project, 'templates/index.css') },
		{ kind: 'html', label: 'HTML', path: options.html_file_name },
		{ kind: 'pdf', label: 'PDF', path: options.pdf_file_name },
		{ kind: 'embedded-html', label: 'Embedded HTML', path: options.embedded_html_file_name },
	];
	return Promise.all(files.map(async (file) => ({ ...file, before: await inspect(file.path) })));
}

export async function fileReport(
	files: readonly PlannedFile[],
	failure?: { error: unknown },
	artifacts: readonly CompilationArtifact[] = [],
): Promise<string> {
	const reason = failure
		? `compilation failed: ${message(failure.error)}`
		: 'compilation completed but the file was not found';
	const lines = await Promise.all(
		files.map(async ({ kind, label, path, before }) => {
			const artifact = artifacts.find(
				(item) => item.kind === kind && resolve(item.path) === resolve(path),
			);
			const after = await inspect(path);
			if (after.kind === 'unknown') return `  Unverified ${label}: ${path} — ${after.reason}`;
			if (!after.state?.file) {
				const detail = after.state ? 'destination is not a regular file' : reason;
				return `  Not created ${label}: ${path} — ${detail}`;
			}
			if (before.kind === 'unknown')
				return `  Unverified ${label}: ${path} — could not inspect before compilation: ${before.reason}`;
			const existed = before.state?.file === true;
			const changed = before.state?.fingerprint !== after.state.fingerprint;
			if (changed) {
				if (artifact?.status === 'not-started')
					return `  Unverified ${label}: ${path} — file changed although this invocation did not attempt it`;
				const caution =
					artifact?.status === 'unverified' || (failure && artifact?.status !== 'completed')
						? failure
							? ' (run failed; file may be incomplete)'
							: ' (completion unverified; file may be incomplete)'
						: '';
				return `  ${existed ? 'Updated' : 'Created'} ${label}: ${path}${caution}`;
			}
			return `  Not updated ${label}: ${path} — existing file retained; ${failure ? reason : 'no filesystem change observed'}`;
		}),
	);
	return `Files:\n${lines.join('\n')}\n`;
}
