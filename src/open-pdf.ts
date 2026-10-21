import { spawn } from 'node:child_process';
import { isAbsolute, win32 } from 'node:path';

// Monitor startup briefly: some desktop launchers wait for the viewer to close.
// Detach without killing it, and never route a filename through a shell.
export async function openPdf(
	path: string,
	platform: NodeJS.Platform = process.platform,
): Promise<void> {
	if (!isAbsolute(path) && !(platform === 'win32' && win32.isAbsolute(path)))
		throw new Error('PDF opening requires an absolute path');
	const command =
		platform === 'darwin'
			? '/usr/bin/open'
			: platform === 'linux'
				? 'xdg-open'
				: platform === 'win32'
					? win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
					: null;
	if (!command) throw new Error(`PDF opening is unsupported on ${platform}`);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, [path], {
			shell: false,
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		});
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.unref();
			if (error) reject(error);
			else resolve();
		};
		child.once('error', (error) => finish(error));
		child.once('exit', (code, signal) =>
			finish(
				code === 0
					? undefined
					: new Error(
							`PDF launcher ${signal ? 'terminated by ' + signal : 'exited with status ' + code}`,
						),
			),
		);
		child.once('spawn', () => {
			child.unref();
			timer = setTimeout(() => finish(), 1000);
		});
	});
}
