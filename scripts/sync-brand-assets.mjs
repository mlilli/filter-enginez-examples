#!/usr/bin/env node
/**
 * Copy the canonical logomark assets out of `@filter-enginez/brand` into every app that serves
 * them statically.
 *
 * @remarks
 * **Why this exists.** `@filter-enginez/brand` is the canonical assets package, and the raw SVG and
 * PNG marks live in it. The four non-React verticals each serve a copy from their own `public/`
 * (`static/` under SvelteKit): four copies of four files, sixteen in all. Hand-copied, they would
 * diverge silently and asymmetrically: someone updates the mark, updates three apps, and the fourth
 * serves the old one until a person happens to look at that vertical on that route. This script is
 * the generator, and `tests/tooling/brandAssets.test.ts` holds every copy byte-identical to its
 * source.
 *
 * **Why the assets stay on disk rather than being imported.** Four apps, four bundlers. Vite resolves
 * `import url from '@filter-enginez/brand/assets/mark.svg'` happily; `@angular/build` needs an
 * `angular.json` loader entry plus an ambient `declare module '*.svg'`, exactly as it already needs
 * for leaflet's CSS and PNGs — and `ngc` catches neither, so `ng build` would
 * become the only gate that could see a mistake here. A generated copy plus a byte-identity test
 * costs one script and pins the invariant in the test tier instead, where every gate sees it.
 *
 * The export exists too (`@filter-enginez/brand/assets/*`), so a vertical that WANTS to import
 * rather than serve can; this script is about the ones that serve.
 *
 * **What this deliberately does NOT cover.** `brand/tokens.css`, which is not distributed to the apps
 * at all — they import it as a module — and which is not a whole-file copy of its design-system
 * source the way these four are. Its `:root` block is verbatim; everything below it is owned by the
 * brand package. `tests/tooling/brandTokens.test.ts` pins that split.
 *
 * Usage: `node scripts/sync-brand-assets.mjs [--check]`
 *   `--check` reports what WOULD be copied and exits non-zero if anything is missing or stale
 *   (`pnpm sync:brand-assets:check`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'packages/brand/src/assets');

/**
 * The assets every vertical serves from its own origin.
 *
 * @remarks
 * `mark.svg` is the full logomark WITH its synaptic rings; `favicon.svg` is the deliberately
 * simplified variant that survives being drawn at 16px. They are not interchangeable: a header
 * pointing at `favicon.svg` renders a ring-less mark on every route while every gate stays green —
 * which is why `tests/tooling/brandAssets.test.ts` also bans component references to the favicon.
 */
const ASSET_FILES = ['mark.svg', 'favicon.svg', 'favicon-16.png', 'favicon-32.png'];

/**
 * Where each vertical serves its static assets from.
 *
 * @remarks
 * SvelteKit's is `static/`; every Vite app uses `public/`. The two React apps are absent on purpose —
 * they render `<Mark />` from the brand package as an inline React component and serve no copy at
 * all, which is the arrangement this script exists to approximate for the other four.
 */
const STATIC_DIRS = [
	'packages/examples-angular/public',
	'packages/examples-sveltekit/static',
	'packages/examples-vanilla/public',
	'packages/examples-vue/public',
];

const isCheckMode = process.argv.includes('--check');

const sources = ASSET_FILES.map((name) => {
	try {
		// Binary-safe: PNGs are in this list, so never read these as utf8.
		return { body: readFileSync(join(SOURCE_DIR, name)), name };
	} catch {
		console.error(`✗ missing ${name} in packages/brand/src/assets — cannot sync brand assets`);
		process.exit(1);
	}
});

const stale = [];

for (const dir of STATIC_DIRS) {
	for (const { body, name } of sources) {
		const dest = join(ROOT, dir, name);
		let current = null;

		try {
			current = readFileSync(dest);
		} catch {
			// Absent — counts as stale.
		}

		if (current !== null && current.equals(body)) {
			continue;
		}
		if (isCheckMode) {
			stale.push(`${dir}/${name}`);
		} else {
			writeFileSync(dest, body);
		}
	}
}

if (isCheckMode && stale.length > 0) {
	console.error(`✗ ${stale.length} brand asset(s) missing or stale:\n   ${stale.join('\n   ')}`);
	console.error('   run: node scripts/sync-brand-assets.mjs');
	process.exit(1);
}

console.log(
	isCheckMode
		? `✓ ${ASSET_FILES.length} brand asset(s) present and current in ${STATIC_DIRS.length} app(s)`
		: `✓ synced ${ASSET_FILES.length} brand asset(s) into ${STATIC_DIRS.length} app(s)`,
);
