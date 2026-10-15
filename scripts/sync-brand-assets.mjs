#!/usr/bin/env node
/**
 * Copy the canonical brand assets out of `@filter-enginez/brand` into every app that serves them
 * statically.
 *
 * @remarks
 * **Why this exists.** `@filter-enginez/brand` is the canonical assets package: the logomark, the icon
 * set every site serves from its root, and the Open Graph card, each a byte copy of its design-system
 * export (`tests/tooling/brandAssets.test.ts` pins that). The seven app hosts each serve copies from
 * their own `public/` (`static/` under SvelteKit). Hand-copied, they would diverge silently and
 * asymmetrically: someone updates the mark, updates six apps, and the seventh serves the old one until
 * a person happens to look at that host. This script is the generator, and
 * `tests/tooling/brandAssets.test.ts` holds every copy byte-identical to its source. The landing site,
 * the eighth host, emits the same files from the brand package at build time instead (`brandImages` in
 * `packages/site/vite.config.ts`).
 *
 * **Why the assets stay on disk rather than being imported.** Six apps, four bundlers. Vite resolves
 * `import url from '@filter-enginez/brand/assets/mark.svg'` happily; `@angular/build` needs an
 * `angular.json` loader entry plus an ambient `declare module '*.svg'`, exactly as it already needs
 * for leaflet's CSS and PNGs — and `ngc` catches neither, so `ng build` would
 * become the only gate that could see a mistake here. And the icon set has to sit at fixed
 * root paths, which browsers and search engines request by name (`/favicon.ico`,
 * `/apple-touch-icon.png`) and the manifest names. A generated copy plus a byte-identity test costs one
 * script and pins the invariant in the test tier instead, where every gate sees it.
 *
 * **What this deliberately does NOT cover.** `brand/tokens.css`, which is not distributed to the apps
 * at all — they import it as a module — and which is not a whole-file copy of its design-system
 * source the way these are. Its `:root` block is verbatim; everything below it is owned by the
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
 * The icon set every host serves from its root and links from its HTML head.
 *
 * @remarks
 * `favicon.svg` is the deliberately simplified glyph that survives being drawn at 16px, and the
 * `favicon-*` PNGs and `favicon.ico` are rendered from it; `icon-*` and `apple-touch-icon.png` are the
 * badge. Search results take a favicon from the home page's `<link rel="icon">` and want a multiple of
 * 48 px, hence the 48 and 96 px files beside the 16 and 32 px ones browsers use.
 */
const ICON_SET = [
	'apple-touch-icon.png',
	'favicon-16.png',
	'favicon-32.png',
	'favicon-48.png',
	'favicon-96.png',
	'favicon.ico',
	'favicon.svg',
	'icon-192.png',
	'icon-512-maskable.png',
	'icon-512.png',
	'site.webmanifest',
];

/**
 * The full logomark, which the four non-React apps' headers and landing cards render from a file.
 *
 * @remarks
 * `mark.svg` is the full logomark WITH its synaptic rings; `favicon.svg` is the simplified variant.
 * They are not interchangeable: a header pointing at `favicon.svg` renders a ring-less mark on every
 * route while every gate stays green — which is why `tests/tooling/brandAssets.test.ts` also bans
 * component references to the favicon. The two React apps render `<Mark />` from the brand package as
 * an inline component and serve no copy.
 */
const LOGOMARK = ['mark.svg'];

/** The Open Graph card, which the hosts whose pages declare `og:image` serve. */
const SOCIAL_CARD = ['og-card.png'];

/**
 * Each app host's static directory, and the assets it serves.
 *
 * @remarks
 * SvelteKit's is `static/`; every other app's is `public/`. `tests/tooling/brandAssets.test.ts` reads
 * this list and cross-checks it against the deploy targets, so a new host cannot be left out.
 */
const TARGETS = [
	{ assets: [...ICON_SET, ...LOGOMARK], dir: 'packages/examples-angular/public' },
	{ assets: [...ICON_SET, ...SOCIAL_CARD], dir: 'packages/examples-docs/public' },
	{ assets: [...ICON_SET, ...SOCIAL_CARD], dir: 'packages/examples-react-plain/public' },
	{ assets: [...ICON_SET, ...SOCIAL_CARD], dir: 'packages/examples-react-rtk/public' },
	{ assets: [...ICON_SET, ...LOGOMARK], dir: 'packages/examples-sveltekit/static' },
	{ assets: [...ICON_SET, ...LOGOMARK], dir: 'packages/examples-vanilla/public' },
	{ assets: [...ICON_SET, ...LOGOMARK], dir: 'packages/examples-vue/public' },
];

const isCheckMode = process.argv.includes('--check');

/** Every asset any target serves, read once, bytes not text: most are PNGs. */
const sources = new Map(
	[...new Set(TARGETS.flatMap((target) => target.assets))].map((name) => {
		try {
			return [name, readFileSync(join(SOURCE_DIR, name))];
		} catch {
			console.error(`✗ missing ${name} in packages/brand/src/assets — cannot sync brand assets`);
			process.exit(1);
		}
	}),
);

const stale = [];

for (const { assets, dir } of TARGETS) {
	for (const name of assets) {
		const body = sources.get(name);
		const dest = join(ROOT, dir, name);
		let current = null;

		try {
			current = readFileSync(dest);
		} catch {
			// Absent — counts as stale.
		}

		if (body === undefined || (current !== null && current.equals(body))) {
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
		? `✓ ${sources.size} brand asset(s) present and current in ${TARGETS.length} app(s)`
		: `✓ synced ${sources.size} brand asset(s) into ${TARGETS.length} app(s)`,
);
