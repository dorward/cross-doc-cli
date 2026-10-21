import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));
import { openPdf } from '../src/open-pdf.ts';

let child;
beforeEach(() => {
	vi.useFakeTimers();
	child = new EventEmitter();
	child.unref = vi.fn();
	spawn.mockReset().mockReturnValue(child);
});
afterEach(() => {
	vi.useRealTimers();
});
it.each([
	['darwin', '/usr/bin/open', '/tmp/My book Ω ; $(touch nope).pdf'],
	['linux', 'xdg-open', '/tmp/My book Ω ; $(touch nope).pdf'],
	['win32', null, 'C:/books/My book Ω & calc.pdf'],
])('passes the PDF as one literal argument on %s', async (platform, command, path) => {
	const pending = openPdf(path, platform);
	expect(spawn).toHaveBeenCalledExactlyOnceWith(
		command ?? expect.stringMatching(/explorer\.exe$/),
		[path],
		{ shell: false, detached: true, stdio: 'ignore', windowsHide: true },
	);
	child.emit('spawn');
	child.emit('exit', 0, null);
	await pending;
	expect(child.unref).toHaveBeenCalled();
});
it('reports unavailable launchers and nonzero/signal startup exits', async () => {
	let pending = openPdf('/book.pdf', 'linux');
	const unavailable = expect(pending).rejects.toThrow('not found');
	child.emit('error', new Error('not found'));
	await unavailable;
	for (const [code, signal] of [
		[3, null],
		[null, 'SIGTERM'],
	]) {
		child = new EventEmitter();
		child.unref = vi.fn();
		spawn.mockReturnValueOnce(child);
		pending = openPdf('/book.pdf', 'linux');
		const failure = expect(pending).rejects.toThrow('PDF launcher');
		child.emit('spawn');
		child.emit('exit', code, signal);
		await failure;
	}
});
it('detaches a long-lived launcher without killing the viewer or waiting for it to close', async () => {
	child.kill = vi.fn();
	const pending = openPdf('/book.pdf', 'linux');
	child.emit('spawn');
	await vi.advanceTimersByTimeAsync(1000);
	await pending;
	expect(child.kill).not.toHaveBeenCalled();
	child.emit('exit', 1, null); // A later viewer/launcher exit cannot change compilation.
	expect(vi.getTimerCount()).toBe(0);
});
it('rejects unsupported platforms and relative paths without spawning', async () => {
	await expect(openPdf('/book.pdf', 'aix')).rejects.toThrow('unsupported');
	await expect(openPdf('relative.pdf', 'linux')).rejects.toThrow('absolute');
	expect(spawn).not.toHaveBeenCalled();
});
