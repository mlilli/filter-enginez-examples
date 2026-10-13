/**
 * `<fe-section-header>` — the filter-panel section label.
 *
 * @remarks
 * Styling is entirely `fe-filter-section-label` in `@filter-enginez/ui-styles`, shared with every
 * other framework and every dataset. Angular's books panel inlined this markup; the real-estate panel
 * has fourteen sections, which would have made it fifteen copies of one heading.
 *
 * Cyan left rule, per the dual-accent contract — a section label names WHAT is being filtered (the
 * data axis). Phosphor here would claim the section is computing.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-section-header',
	template: `
		<h3 class="fe-filter-section-label">
			{{ label() }}
			<!-- Truthiness, not an undefined check: an empty note is a note nobody wrote, and
			     rendering it would add a blank second line under the heading. Matches Vue's v-if. -->
			@if (note()) {
				<br />
				<span class="fe-filter-section-label__note">{{ note() }}</span>
			}
		</h3>
	`,
})
export class SectionHeaderComponent {
	/** The section's name, e.g. `Price`. */
	public readonly label = input.required<string>();

	/** Optional second line — a unit, a caveat, or a hint about the facet's semantics. */
	public readonly note = input<string>();
}
