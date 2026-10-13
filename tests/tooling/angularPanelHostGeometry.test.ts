/**
 * Every Angular filter panel must make its host transparent to the flex layout.
 *
 * @remarks
 * ### The failure, which is invisible in the markup
 *
 * The sidebar layout is a bounded-height chain: `.fe-sidebar-app__filters` caps the height,
 * `.fe-filter-panel` claims `flex: 1 1 0%` + `min-height: 0` to become the scroll container, and
 * `.fe-filter-panel__scroller` carries the overflow. In React, Vue, Svelte and vanilla the panel is a
 * direct child of the aside, so the chain is unbroken.
 *
 * **Angular inserts an element the others do not have.** `<fe-wine-filter-panel>` sits between the
 * aside and the panel div, and an unknown element defaults to `display: inline` — not a flex
 * container. The panel inside it never receives a bounded height, so the sections overflow instead of
 * scrolling and the bottom of the panel is unreachable.
 *
 * Every class involved is present and correct, which is exactly why this is hard to see: the markup
 * looks right, `fe-filter-panel__scroller` is there, and nothing errors. Only the rendered geometry is
 * wrong, and jsdom does not do layout — so `ng test` cannot catch it either.
 *
 * ### Why a test rather than a note
 *
 * The fix is a one-line `:host` style, and every panel needs its own copy. A comment on one panel
 * does not reach the next: a new panel with the same layout and the same DOM chain, written without
 * reading its sibling, scrolls nowhere.
 *
 * So this asserts the property rather than trusting the precedent: any component whose selector ends
 * `-filter-panel` must declare a host style that makes it a bounded flex column.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_DIR = resolve(REPO_ROOT, 'packages/examples-angular/src/app');

/** Every `*-filter-panel.component.ts` under the Angular app, discovered rather than listed. */
async function filterPanelComponents(): Promise<readonly string[]> {
	const { readdirSync, statSync } = await import('node:fs');
	const found: string[] = [];

	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);

			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (name.endsWith('-filter-panel.component.ts') && !name.includes('.spec.')) {
				found.push(full);
			}
		}
	};

	walk(APP_DIR);

	return found.sort();
}

describe('Angular filter panels make their host layout-transparent', () => {
	it('finds the panels rather than trusting a hand-kept list', async () => {
		// Discovery, not a roster: a third Angular panel must be covered the day it exists, and a
		// hand-kept list is the failure `brandAssets.test.ts` describes.
		const panels = await filterPanelComponents();

		expect(panels.length).toBeGreaterThanOrEqual(2);
	});

	it('each declares a :host style that keeps the bounded-height chain intact', async () => {
		const panels = await filterPanelComponents();
		const offenders: string[] = [];

		for (const file of panels) {
			const source = readFileSync(file, 'utf8');
			const host = /:host\s*\{[^}]*\}/su.exec(source)?.[0] ?? '';
			// All four matter. `display: flex` + `flex-direction: column` make it a column container,
			// `flex: 1 1 0%` lets it take the aside's bounded height, and `min-height: 0` is what allows
			// it to shrink below its content — without that last one a flex item refuses to shrink and
			// the scroller never engages, which looks identical to having no style at all.
			const isComplete =
				/display:\s*flex/u.test(host)
				&& /flex-direction:\s*column/u.test(host)
				&& /flex:\s*1\s+1\s+0%/u.test(host)
				&& /min-height:\s*0/u.test(host);

			if (!isComplete) {
				offenders.push(relative(REPO_ROOT, file));
			}
		}

		expect(offenders, 'Angular filter panels missing the host-geometry style').toEqual([]);
	});
});
