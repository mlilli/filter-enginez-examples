/**
 * The home page's one enhancement: a button that copies the install command.
 *
 * @remarks
 * ## Progressive enhancement, and why there is no fallback
 *
 * The command is plain, selectable text in `index.html`, so it can always be copied by hand. The
 * button is in the HTML too, but `hidden`: {@link enhanceInstallCopy} reveals it only where it can
 * work, which is wherever `navigator.clipboard.writeText` exists. Without JavaScript, or without the
 * Clipboard API, there is no button to fail.
 *
 * That API is in every current browser, and only in secure contexts — the site is served over HTTPS,
 * and `localhost` counts as secure in development. The one alternative, `document.execCommand('copy')`
 * over a temporary selection, is deprecated, and the visitors it would serve can already select the
 * command. So the button is not given one.
 *
 * ## What the button says, and to whom
 *
 * Its accessible name is fixed, "Copy install command" (`aria-label` in the HTML), so a screen reader
 * never hears the control renamed under it. Its visible label — "Copy", hidden from assistive
 * technology — shows the outcome for {@link COPY_RESULT_DURATION_MS}: "Copied", or "Failed" when the
 * browser refuses the write (a permission policy, or a page without focus). The outcome is announced
 * through the polite live region beside it (`role="status"`), which is emptied before every attempt
 * so a second copy is announced again.
 *
 * @packageDocumentation
 */

/** How long the button shows an outcome before it reads "Copy" again, in milliseconds. */
export const COPY_RESULT_DURATION_MS = 2000;

/** The button's visible label in each state. */
export const COPY_LABELS = {
	copied: 'Copied',
	failed: 'Failed',
	idle: 'Copy',
} as const;

/** What the live region announces for each outcome. */
export const COPY_ANNOUNCEMENTS = {
	copied: 'Install command copied to the clipboard.',
	failed: 'Could not copy the install command. Select the command and copy it instead.',
} as const;

/** The selectors of the install block's four hooks in `index.html`. */
export const INSTALL_COPY_HOOKS = {
	/** The button, `hidden` until enhanced. */
	button: '[data-copy-button]',
	/** The button's visible label, inside it. */
	label: '[data-copy-label]',
	/** The element holding the command. */
	source: '[data-copy-source]',
	/** The polite live region announcing the outcome. */
	status: '[data-copy-status]',
} as const;

/** What {@link enhanceInstallCopy} needs from `navigator`: the Clipboard API, where there is one. */
export interface ClipboardHost {
	/** The clipboard; absent outside secure contexts and in browsers without the API. */
	readonly clipboard?: Partial<Pick<Clipboard, 'writeText'>>;
}

/**
 * Find a required element of the install block.
 *
 * @param root - Where to look.
 * @param selector - One of {@link INSTALL_COPY_HOOKS}.
 * @returns The element.
 * @throws When the markup lacks it — `index.html` and the script are out of step.
 */
function requireElement<ElementType extends Element>(root: ParentNode, selector: string): ElementType {
	const element = root.querySelector<ElementType>(selector);

	if (element === null) {
		throw new Error(`The install block has no ${selector} element.`);
	}

	return element;
}

/**
 * Reveal and wire the install command's copy button, where the browser can copy.
 *
 * @param page - The document (or any root holding the install block).
 * @param host - `navigator`, or a stand-in with the same `clipboard`.
 */
export function enhanceInstallCopy(page: ParentNode, host: ClipboardHost): void {
	const { clipboard } = host;

	if (clipboard?.writeText === undefined) {
		return;
	}
	// Bound, because `writeText` called off its object throws "Illegal invocation" in browsers.
	const writeText = clipboard.writeText.bind(clipboard);
	const button = requireElement<HTMLButtonElement>(page, INSTALL_COPY_HOOKS.button);
	const label = requireElement<HTMLElement>(button, INSTALL_COPY_HOOKS.label);
	const status = requireElement<HTMLElement>(page, INSTALL_COPY_HOOKS.status);
	const command = requireElement<HTMLElement>(page, INSTALL_COPY_HOOKS.source).textContent.trim();
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Show an outcome, announce it, and return to "Copy" after {@link COPY_RESULT_DURATION_MS}.
	 *
	 * @remarks
	 * The pending return of an earlier outcome is cancelled first, so each outcome is shown for the
	 * full duration however soon after the last one it lands.
	 *
	 * @param outcome - What the write did.
	 */
	const showOutcome = (outcome: 'copied' | 'failed'): void => {
		clearTimeout(resetTimer);
		label.textContent = COPY_LABELS[outcome];
		button.setAttribute('data-copy-state', outcome);
		status.textContent = COPY_ANNOUNCEMENTS[outcome];
		resetTimer = setTimeout(() => {
			label.textContent = COPY_LABELS.idle;
			button.removeAttribute('data-copy-state');
			status.textContent = '';
		}, COPY_RESULT_DURATION_MS);
	};

	button.addEventListener('click', () => {
		// Emptied first, so the outcome below is a change the live region announces even when it
		// repeats the last one.
		status.textContent = '';
		writeText(command).then(
			() => {
				showOutcome('copied');
			},
			() => {
				showOutcome('failed');
			},
		);
	});
	button.hidden = false;
}
