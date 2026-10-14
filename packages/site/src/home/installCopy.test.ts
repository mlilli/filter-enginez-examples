/**
 * Tests for `installCopy.ts` — the install command's copy button.
 *
 * @remarks
 * Run against `index.html` itself, parsed, so the hooks the script needs and the markup that carries
 * them are checked together. The clipboard is a stand-in with the shape of the real one: a `writeText`
 * METHOD that answers with a promise and, like the browser's, refuses to run detached from its object.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import homePageHtml from '../../index.html?raw';
import {
	COPY_ANNOUNCEMENTS,
	COPY_LABELS,
	COPY_RESULT_DURATION_MS,
	enhanceInstallCopy,
	INSTALL_COPY_HOOKS,
} from './installCopy.js';

/** The command the page shows. */
const INSTALL_COMMAND = 'pnpm add @filter-enginez/core';

/** A clipboard whose writes succeed or fail on demand, and which, like the browser's, needs its `this`. */
class FakeClipboard {
	/** What each write was asked to copy. */
	public readonly written: string[] = [];

	/** Whether the next write is refused. */
	public isRefusing = false;

	/**
	 * Copy text, or refuse to.
	 *
	 * @param text - The text.
	 * @returns A promise settling on a later turn, as the browser's does.
	 * @throws TypeError when called detached from its clipboard, as the browser's does.
	 */
	public async writeText(text: string): Promise<void> {
		if (!(this as unknown instanceof FakeClipboard)) {
			throw new TypeError('Illegal invocation');
		}
		await Promise.resolve();
		if (this.isRefusing) {
			throw new DOMException('Document is not focused.', 'NotAllowedError');
		}
		this.written.push(text);
	}
}

/**
 * Parse the home page.
 *
 * @returns A fresh document of `index.html`.
 */
function loadHomePage(): Document {
	return new DOMParser().parseFromString(homePageHtml, 'text/html');
}

/**
 * The install block's parts.
 *
 * @param page - The parsed page.
 * @returns The button, its visible label and the live region.
 */
function installBlock(page: Document): { readonly button: HTMLButtonElement; readonly label: HTMLElement; readonly status: HTMLElement } {
	const button = page.querySelector<HTMLButtonElement>(INSTALL_COPY_HOOKS.button);
	const label = button?.querySelector<HTMLElement>(INSTALL_COPY_HOOKS.label);
	const status = page.querySelector<HTMLElement>(INSTALL_COPY_HOOKS.status);

	if (button === null || label === null || label === undefined || status === null) {
		throw new Error('index.html lost a hook of its install block');
	}

	return { button, label, status };
}

/**
 * Let a write's promise settle, without letting any time pass.
 *
 * @returns Once the pending promise callbacks have run.
 */
async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the install block in index.html', () => {
	it('ships the button hidden, named for what it copies, beside a polite live region', () => {
		const { button, label, status } = installBlock(loadHomePage());

		expect(button.hidden).toBe(true);
		expect(button.type).toBe('button');
		expect(button.getAttribute('aria-label')).toBe('Copy install command');
		// The visible label is in the accessible name, as WCAG's "label in name" asks.
		expect(button.getAttribute('aria-label')).toContain(label.textContent.trim());
		expect(label.getAttribute('aria-hidden')).toBe('true');
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent).toBe('');
		expect(loadHomePage().querySelector(INSTALL_COPY_HOOKS.source)?.textContent).toBe(INSTALL_COMMAND);
	});
});

describe('enhanceInstallCopy', () => {
	it('leaves the button hidden where there is no clipboard at all', () => {
		const page = loadHomePage();

		enhanceInstallCopy(page, {});

		expect(installBlock(page).button.hidden).toBe(true);
	});

	it('leaves the button hidden where the clipboard cannot write text', () => {
		const page = loadHomePage();

		enhanceInstallCopy(page, { clipboard: {}});

		expect(installBlock(page).button.hidden).toBe(true);
	});

	it('reveals the button where it can copy, and copies the command on a click', async () => {
		const page = loadHomePage();
		const clipboard = new FakeClipboard();

		enhanceInstallCopy(page, { clipboard });

		const { button } = installBlock(page);

		expect(button.hidden).toBe(false);

		button.click();
		await settle();

		expect(clipboard.written).toEqual([INSTALL_COMMAND]);
	});

	it('shows "Copied" and announces it, keeps its name, then reads "Copy" again', async () => {
		const page = loadHomePage();

		enhanceInstallCopy(page, { clipboard: new FakeClipboard() });

		const { button, label, status } = installBlock(page);

		button.click();
		await settle();

		expect(label.textContent).toBe(COPY_LABELS.copied);
		expect(button.getAttribute('data-copy-state')).toBe('copied');
		expect(status.textContent).toBe(COPY_ANNOUNCEMENTS.copied);
		expect(button.getAttribute('aria-label')).toBe('Copy install command');

		vi.advanceTimersByTime(COPY_RESULT_DURATION_MS);

		expect(label.textContent).toBe(COPY_LABELS.idle);
		expect(button.hasAttribute('data-copy-state')).toBe(false);
		expect(status.textContent).toBe('');
	});

	it('says so when the browser refuses the write', async () => {
		const page = loadHomePage();
		const clipboard = new FakeClipboard();

		clipboard.isRefusing = true;
		enhanceInstallCopy(page, { clipboard });

		const { button, label, status } = installBlock(page);

		button.click();
		await settle();

		expect(label.textContent).toBe(COPY_LABELS.failed);
		expect(button.getAttribute('data-copy-state')).toBe('failed');
		expect(status.textContent).toBe(COPY_ANNOUNCEMENTS.failed);
	});

	it('empties the live region on every click, so a repeated outcome is announced again', async () => {
		const page = loadHomePage();

		enhanceInstallCopy(page, { clipboard: new FakeClipboard() });

		const { button, status } = installBlock(page);

		button.click();
		await settle();
		button.click();

		expect(status.textContent).toBe('');

		await settle();

		expect(status.textContent).toBe(COPY_ANNOUNCEMENTS.copied);
	});

	it('holds a second outcome for its full duration, not the remainder of the first', async () => {
		const page = loadHomePage();

		enhanceInstallCopy(page, { clipboard: new FakeClipboard() });

		const { button, label } = installBlock(page);

		button.click();
		await settle();
		vi.advanceTimersByTime(COPY_RESULT_DURATION_MS - 500);
		button.click();
		await settle();
		vi.advanceTimersByTime(500);

		expect(label.textContent).toBe(COPY_LABELS.copied);

		vi.advanceTimersByTime(COPY_RESULT_DURATION_MS - 500);

		expect(label.textContent).toBe(COPY_LABELS.idle);
	});

	it('names the hook it cannot find, when the markup and the script are out of step', () => {
		const page = loadHomePage();

		page.querySelector(INSTALL_COPY_HOOKS.status)?.remove();

		expect(() => {
			enhanceInstallCopy(page, { clipboard: new FakeClipboard() });
		}).toThrow(`The install block has no ${INSTALL_COPY_HOOKS.status} element.`);
	});
});
