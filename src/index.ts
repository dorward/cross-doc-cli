#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCommand } from './command.js';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<0 | 1> {
	return runCommand(argv, {
		cwd: process.cwd(),
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
		// Help/version and argument errors do not need the compiler or its dependencies.
		compile: async (options, diagnostics) => {
			const { compile } = await import('./compile.js');
			await compile(options, diagnostics);
		},
	});
}

function isExecutable(): boolean {
	if (!process.argv[1]) return false;
	try {
		return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
	} catch {
		return false;
	}
}

if (isExecutable()) process.exitCode = await main();
