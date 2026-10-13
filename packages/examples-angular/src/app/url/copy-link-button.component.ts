/**
 * `<fe-copy-link-button>` — copies the current shareable URL, with a brief confirmation.
 *
 * @remarks
 * `aria-live="polite"` on the button means the label change from "Copy link" to "Copied!" is
 * announced, so the confirmation isn't sighted-only.
 *
 * A clipboard rejection is a deliberate silent no-op: permission was denied or the document isn't
 * focused, neither of which the person can act on, and an error toast for "you didn't copy a URL"
 * would be worse than nothing.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';

/** How long the confirmation label persists. */
const COPIED_FEEDBACK_MS = 1600;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-copy-link-button',
	template: `
		<button type="button" class="fe-copy-link" aria-live="polite" (click)="copy()">
			<svg
				viewBox="0 0 24 24"
				width="16"
				height="16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
				<path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
			</svg>
			{{ isCopied() ? 'Copied!' : 'Copy link' }}
		</button>
	`,
})
export class CopyLinkButtonComponent {
	/** Whether the confirmation label is showing. */
	protected readonly isCopied = signal(false);

	private readonly _destroyRef = inject(DestroyRef);

	/** Pending label reset, so a rapid second click restarts the window rather than stacking. */
	private _resetTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor() {
		this._destroyRef.onDestroy(() => {
			if (this._resetTimer !== null) {
				clearTimeout(this._resetTimer);
			}
		});
	}

	/** Copy the address bar's current contents. */
	protected copy(): void {
		// `lib.dom` declares `navigator.clipboard` non-optional, so typed-lint reads this guard as dead
		// code. It is not. The Clipboard API is genuinely absent on insecure origins — which is exactly
		// where a demo app tends to get opened: a bare LAN IP, a colleague's machine over plain http. The
		// DOM lib is describing the spec, not the reality, so the check stays and the rule is silenced
		// rather than the code contorted around it.
		const { clipboard } = navigator;

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Absent on insecure origins; see above.
		if (clipboard === undefined) {
			return;
		}

		void clipboard.writeText(window.location.href).then(
			() => {
				this.isCopied.set(true);

				if (this._resetTimer !== null) {
					clearTimeout(this._resetTimer);
				}
				this._resetTimer = setTimeout(() => {
					this._resetTimer = null;
					this.isCopied.set(false);
				}, COPIED_FEEDBACK_MS);
			},
			() => {
				// Permission denied or document unfocused — nothing useful to say.
			},
		);
	}
}
