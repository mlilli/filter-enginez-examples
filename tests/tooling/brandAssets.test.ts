/**
 * The logomark assets, asserted against the one package that owns them.
 *
 * @remarks
 * The brand ships two logomark SVGs: `/mark.svg`, with the synaptic rings, and `/favicon.svg`, the
 * deliberately simplified variant that has to survive being drawn at 16px. A header `<img>` pointing
 * at the favicon instead of the mark renders a ring-less mark on every route while both SVGs are
 * correct and every other gate is green — and since an app can be right on one page and wrong on
 * another, no side-by-side comparison of apps puts the two next to each other.
 *
 * No type can catch that. It is a wrong string in an attribute, and the only instrument that reports
 * it directly is an eye on a rendered page. So the two
 * things this file pins are the two that DON'T need an eye: that the copies never drift from their
 * source, and that a component never reaches for the favicon again.
 *
 * The copies exist at all because four bundlers is three too many to import through — see
 * `scripts/sync-brand-assets.mjs` for why a generated asset beat an `angular.json` loader entry.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BRAND_ASSETS = resolve(REPO_ROOT, 'packages/brand/src/assets');

/** The assets `scripts/sync-brand-assets.mjs` distributes. */
const ASSET_FILES = ['favicon-16.png', 'favicon-32.png', 'favicon.svg', 'mark.svg'] as const;

/**
 * Where each vertical serves its static assets from.
 *
 * @remarks
 * Hand-kept here and in the sync script, and cross-checked below against what is actually on disk —
 * a roster that can silently cover fewer apps than exist reads as a shorter green suite rather than as
 * a gap.
 */
const STATIC_DIRS = [
	'packages/examples-angular/public',
	'packages/examples-sveltekit/static',
	'packages/examples-vanilla/public',
	'packages/examples-vue/public',
] as const;

/**
 * The design-system files the brand copies are taken from.
 *
 * @remarks
 * Only the logomark files belong here. `brand/tokens.css` is not a byte-identical copy of
 * `colors_and_type.css`, because the file has a second job — see
 * `tests/tooling/brandTokens.test.ts`, which pins the half that IS equal (the `:root` block) and
 * asserts the rest stays deliberately different.
 */
const DESIGN_SYSTEM_SOURCES: Readonly<Record<string, string>> = {
	'favicon-16.png': 'docs/branding/design-system/assets/logomark/png/favicon-16.png',
	'favicon-32.png': 'docs/branding/design-system/assets/logomark/png/favicon-32.png',
	'favicon.svg': 'docs/branding/design-system/assets/logomark/svg/favicon-primary.svg',
	'mark.svg': 'docs/branding/design-system/assets/logomark/svg/mark-primary.svg',
};

/**
 * Read a file as bytes.
 *
 * @remarks
 * Bytes, never utf8 — two of the four are PNGs, and a utf8 read of a PNG is a lossy comparison.
 *
 * @param path - Repo-relative or absolute path.
 * @returns The file contents.
 */
function bytes(path: string): Buffer {
	return readFileSync(resolve(REPO_ROOT, path));
}

/**
 * Every source file under a package's `src`, recursively.
 *
 * @param dir - Absolute directory to walk.
 * @returns Absolute file paths.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		return statSync(path).isDirectory() ? sourceFiles(path) : [path];
	});
}

describe('brand assets', () => {
	it.each(ASSET_FILES)('%s matches its design-system source', (name) => {
		const source = DESIGN_SYSTEM_SOURCES[name];

		expect(source, `no design-system source recorded for ${name}`).toBeDefined();
		expect(bytes(join('packages/brand/src/assets', name))).toEqual(bytes(source ?? ''));
	});

	it.each(STATIC_DIRS.flatMap((dir) => ASSET_FILES.map((name) => [dir, name] as const)))(
		'%s/%s matches the brand package',
		(dir, name) => {
			// The assertion the sync script's `--check` makes from the CLI, made again where every gate
			// runs. `--check` only fires if someone remembers to run it; this fires on `pnpm test`.
			expect(bytes(join(dir, name))).toEqual(bytes(join('packages/brand/src/assets', name)));
		},
	);

	it('keeps the two marks DIFFERENT, which is the whole hazard', () => {
		// If these ever became the same file the mix-up would stop mattering — and so would this suite.
		// They are different on purpose: `mark.svg` carries the synaptic rings, `favicon.svg` drops them
		// so the glyph reads at 16px. Stating it here means a future "simplification" that collapses
		// them has to argue with a test rather than pass silently.
		expect(bytes('packages/brand/src/assets/mark.svg'))
			.not.toEqual(bytes('packages/brand/src/assets/favicon.svg'));
	});

	it('has no component source reaching for the favicon', () => {
		// THE regression guard. `/favicon.svg` belongs in exactly one place — the `<link rel="icon">` of
		// an app's HTML shell. Anywhere in component source it is a header or a landing card about to
		// render the ring-less mark.
		const offenders = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((name) => name.startsWith('examples-'))
			.map((name) => resolve(REPO_ROOT, 'packages', name, 'src'))
			.filter((dir) => {
				try {
					return statSync(dir).isDirectory();
				} catch {
					return false;
				}
			})
			.flatMap(sourceFiles)
			// `.html` is the app shell — SvelteKit's `app.html`, Angular's `index.html`, each Vite
			// `index.html`. That is the one legitimate reference.
			.filter((file) => !file.endsWith('.html'))
			.filter((file) => readFileSync(file, 'utf8').includes('/favicon.svg'))
			.map((file) => file.replace(`${REPO_ROOT}/`, ''));

		expect(offenders, 'component source must use /mark.svg — /favicon.svg is the 16px variant').toEqual([]);
	});

	it('has the sync script covering every app that actually serves a copy', () => {
		// A hand-kept roster that covers three of four apps syncs three of four and reports success.
		// Derived from disk so a fifth vertical's `public/mark.svg` fails here rather than going stale
		// quietly.
		const onDisk = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((name) => name.startsWith('examples-'))
			.flatMap((name) => ['public', 'static'].map((dir) => `packages/${name}/${dir}`))
			.filter((dir) => {
				try {
					return statSync(resolve(REPO_ROOT, dir, 'mark.svg')).isFile();
				} catch {
					return false;
				}
			});

		expect(onDisk.sort()).toEqual([...STATIC_DIRS].sort());
	});

	it('has the sync script listing every asset in the brand package', () => {
		// The inverse: an asset added to `brand/src/assets` and forgotten by the script would never
		// reach an app, and the byte-identity assertions above only cover files the list already names.
		const script = readFileSync(resolve(REPO_ROOT, 'scripts/sync-brand-assets.mjs'), 'utf8');

		for (const name of readdirSync(BRAND_ASSETS)) {
			expect(script, `sync-brand-assets.mjs never mentions ${name}`).toContain(`'${name}'`);
		}
	});
});
