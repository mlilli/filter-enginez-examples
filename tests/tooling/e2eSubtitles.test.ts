/**
 * The e2e boot signals must come from the vertical registry, not from a literal.
 *
 * @remarks
 * Every dataset route paints `Dataset · Stack` under the wordmark, from
 * `examples-shared/src/verticals/verticals.ts`. A spec that spells that string out itself breaks the
 * moment the header wording changes, and a change to one registry entry becomes a failing assertion
 * in every spec that copied it.
 *
 * The specs derive their boot signal through `tests/e2e/subtitles.ts`. This test is the part that
 * cannot be enforced by the derivation itself: **a NEW spec is free to type a literal again**, and it
 * would pass on the day it was written, which is exactly how copies accumulate. Nothing
 * else notices, because a stale boot literal fails as a 30-second timeout in a browser rather than as a
 * gate.
 *
 * The ban is scoped to text assertions. `getByRole('link', { name: 'Explore Books · config-driven' })`
 * is a real link label that belongs to the landing page's dataset catalog, not to the header registry,
 * and it should stay written where it is read.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_DIR = resolve(REPO_ROOT, 'tests/e2e');

/**
 * A text assertion carrying a string literal with the header's middle-dot separator.
 *
 * @remarks
 * `[^'\n]*` rather than `.*`: the literal cannot span lines, and refusing to cross one keeps the
 * match anchored to the call it came from.
 */
const SUBTITLE_LITERAL =
	/(?:getByText|toHaveText|toContainText)\(\s*'([^'\n]* · [^'\n]*)'/gu;

/** Every spec + helper under `tests/e2e`. */
function e2eSources(): readonly string[] {
	return readdirSync(E2E_DIR).filter((name) => name.endsWith('.ts'));
}

describe('e2e boot signals', () => {
	it('has spec files to check', () => {
		// Guards the guard: a moved directory would otherwise make this suite vacuously green.
		expect(e2eSources().length).toBeGreaterThan(20);
	});

	it('never spells a `Dataset · Stack` subtitle out in a text assertion', () => {
		const offenders = e2eSources().flatMap((name) => {
			const source = readFileSync(resolve(E2E_DIR, name), 'utf8');

			return [...source.matchAll(SUBTITLE_LITERAL)].map(([, literal]) => `${name}: '${literal}'`);
		});

		expect(offenders, 'use `subtitle(dataset, vertical, tier)` from ./subtitles.js').toEqual([]);
	});

	it('routes every vertical through the one seam', () => {
		// `subtitles.ts` re-exports rather than re-declaring. If someone replaces the re-export with a
		// hand-written map, the specs go green while drifting from the apps — the failure this
		// whole arrangement exists to prevent.
		const seam = readFileSync(resolve(E2E_DIR, 'subtitles.ts'), 'utf8');

		expect(seam).toContain('packages/examples-shared/src/verticals/verticals.js');
		expect(seam).toContain('verticalSubtitle as subtitle');
	});
});
