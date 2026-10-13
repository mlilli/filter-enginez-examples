/**
 * `<fe-url-format-toggle>` — cycles the shareable-URL encoding in place.
 *
 * @remarks
 * Clicking re-encodes whatever state is already in the address bar into the next format, so you can
 * watch one filter selection render as readable text, then compact, then base64, without the link
 * ever ceasing to work. That is the demo: URL state is a serialization concern, and the tagged format
 * means old links keep resolving whatever you switch to.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { cycleUrlFormat, reEncodeUrlFormat, URL_FORMAT_LABELS, urlFormat } from './url-state.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-url-format-toggle',
	template: `
		<button
			type="button"
			class="fe-url-format-toggle"
			[attr.aria-label]="
				'Shareable-URL format: ' + label() + '. Activate to cycle formats.'
			"
			title="Cycle the shareable-URL encoding"
			(click)="cycle()"
		>
			<span class="fe-url-format-toggle__kicker">URL</span>
			{{ label() }}
		</button>
	`,
})
export class UrlFormatToggleComponent {
	// The format lives in a module-level signal rather than component state, because the sync loop in
	// `url-state.ts` reads it too. So these two members genuinely have no `this` to use — they
	// are typed delegates to module functions, which is what the disables below record.
	/** The active format's display label. */
	// eslint-disable-next-line class-methods-use-this -- Reads the module-level format signal; see above.
	protected label(): string {
		return URL_FORMAT_LABELS[urlFormat()];
	}

	/** Advance the format and rewrite the current URL into it. */
	// eslint-disable-next-line class-methods-use-this -- Mutates the module-level format signal; see above.
	protected cycle(): void {
		reEncodeUrlFormat(cycleUrlFormat());
	}
}
