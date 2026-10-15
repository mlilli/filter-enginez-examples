/**
 * The brand assets, asserted against the one package that owns them, and the icon set every host
 * serves.
 *
 * @remarks
 * ### The two marks
 *
 * The brand ships two logomark SVGs: `/mark.svg`, with the synaptic rings, and `/favicon.svg`, the
 * deliberately simplified variant that has to survive being drawn at 16px. A header `<img>` pointing
 * at the favicon instead of the mark renders a ring-less mark on every route while both SVGs are
 * correct and every other gate is green — and since an app can be right on one page and wrong on
 * another, no side-by-side comparison of apps puts the two next to each other. So this file pins that a
 * component never reaches for the favicon.
 *
 * ### One source, eight hosts
 *
 * Every file is a byte copy of its design-system export in `@filter-enginez/brand`, and every app
 * serves copies of those (`scripts/sync-brand-assets.mjs`; see it for why copies beat four bundlers'
 * imports), while the landing site emits them from the brand package at build time. Each of the eight
 * hosts — every Cloudflare deploy target — serves the full icon set at its root and links it from its
 * HTML head: a search engine takes a site's favicon from its home page's `<link rel="icon">`, wants a
 * multiple of 48 px, and treats every subdomain as a site of its own. The rosters are read from the
 * sync script and the deploy targets rather than restated, so a new host is checked the day it appears.
 *
 * ### Two favicon artworks
 *
 * The 48 and 96 px PNGs and every image in `favicon.ico` are the dark circular badge, which reads on the
 * white and light-gray pages a search result is shown on; the 16 and 32 px PNGs are the glyph a browser
 * tab draws (`scripts/rasterize-brand-icons.mjs` says why). Which is which is checked on the pixels.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BRAND_ASSETS = 'packages/brand/src/assets';
const LOGOMARK = 'docs/branding/design-system/assets/logomark';

/**
 * The design-system file each brand asset is a byte copy of.
 *
 * @remarks
 * Only whole-file copies belong here. `brand/tokens.css` is not a byte-identical copy of
 * `colors_and_type.css`, because the file has a second job — see `tests/tooling/brandTokens.test.ts`.
 */
const DESIGN_SYSTEM_SOURCES: Readonly<Record<string, string>> = {
	'apple-touch-icon.png': `${LOGOMARK}/png/apple-touch-icon-180.png`,
	'favicon-16.png': `${LOGOMARK}/png/favicon-16.png`,
	'favicon-32.png': `${LOGOMARK}/png/favicon-32.png`,
	'favicon-48.png': `${LOGOMARK}/png/favicon-48.png`,
	'favicon-96.png': `${LOGOMARK}/png/favicon-96.png`,
	'favicon.ico': `${LOGOMARK}/ico/favicon.ico`,
	'favicon.svg': `${LOGOMARK}/svg/favicon-primary.svg`,
	'icon-192.png': `${LOGOMARK}/png/icon-192.png`,
	'icon-512-maskable.png': `${LOGOMARK}/png/icon-512-maskable.png`,
	'icon-512.png': `${LOGOMARK}/png/icon-512.png`,
	'mark.svg': `${LOGOMARK}/svg/mark-primary.svg`,
	'og-card.png': `${LOGOMARK}/png/og-card.png`,
	'site.webmanifest': `${LOGOMARK}/site.webmanifest`,
};

/**
 * The tags every host's home page links its icon set with, `{root}` standing for the root path (`` or
 * SvelteKit's `%sveltekit.assets%`).
 */
const ICON_LINKS = [
	'<link rel="icon" href="{root}/favicon.ico" sizes="16x16 32x32 48x48" />',
	'<link rel="icon" type="image/svg+xml" href="{root}/favicon.svg" />',
	'<link rel="icon" type="image/png" sizes="16x16" href="{root}/favicon-16.png" />',
	'<link rel="icon" type="image/png" sizes="32x32" href="{root}/favicon-32.png" />',
	'<link rel="icon" type="image/png" sizes="48x48" href="{root}/favicon-48.png" />',
	'<link rel="icon" type="image/png" sizes="96x96" href="{root}/favicon-96.png" />',
	'<link rel="icon" type="image/png" sizes="192x192" href="{root}/icon-192.png" />',
	'<link rel="apple-touch-icon" sizes="180x180" href="{root}/apple-touch-icon.png" />',
	'<link rel="manifest" href="{root}/site.webmanifest" />',
] as const;

/**
 * Read a file as bytes.
 *
 * @remarks
 * Bytes, never utf8 — most are PNGs, and a utf8 read of a PNG is a lossy comparison.
 *
 * @param path - Repo-relative path.
 * @returns The file contents.
 */
function bytes(path: string): Buffer {
	return readFileSync(resolve(REPO_ROOT, path));
}

/**
 * Whether two files hold the same bytes.
 *
 * @remarks
 * A boolean rather than `toEqual` on the buffers: on a mismatch Vitest diffs the two buffers byte by
 * byte, which for a 500 kB image takes minutes. The message names the files instead.
 *
 * @param path - One repo-relative path.
 * @param other - The other.
 * @returns `true` when the contents are identical.
 */
function sameBytes(path: string, other: string): boolean {
	return bytes(path).equals(bytes(other));
}

/**
 * Read a file as text.
 *
 * @param path - Repo-relative path.
 * @returns The file contents.
 */
function text(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * A quoted-string list declared in a source file, by name.
 *
 * @param source - The file's text.
 * @param name - The constant's name.
 * @returns The strings it lists.
 */
function declaredList(source: string, name: string): readonly string[] {
	const body = new RegExp(`const ${name}(?::[^=]+)? = \\[([\\s\\S]*?)\\];`, 'u').exec(source)?.[1] ?? '';

	return [...body.matchAll(/'([^']+)'/gu)].map(([, value]) => value ?? '');
}

/** The sync script's source. */
const SYNC_SCRIPT = text('scripts/sync-brand-assets.mjs');

/** The icon set, as the sync script lists it. */
const ICON_SET = declaredList(SYNC_SCRIPT, 'ICON_SET');

/**
 * The sync script's targets: each app's static directory and the assets it serves, read from the
 * script's `TARGETS` (`{ assets: [...ICON_SET, ...LOGOMARK], dir: '…' }`).
 */
const SYNC_TARGETS: readonly { readonly assets: readonly string[]; readonly dir: string }[] = [
	...SYNC_SCRIPT.matchAll(/\{ assets: \[([^\]]*)\], dir: '([^']+)' \}/gu),
].map(([, spreads, dir]) => ({
	assets: [...(spreads ?? '').matchAll(/\.\.\.([A-Z_]+)/gu)].flatMap(([, list]) => declaredList(SYNC_SCRIPT, list ?? '')),
	dir: dir ?? '',
}));

/** The files the landing site's build emits from the brand package (`BRAND_FILES` in its Vite config). */
const SITE_BRAND_FILES = declaredList(text('packages/site/vite.config.ts'), 'BRAND_FILES');

/** Every deploy target, each one a host a search engine treats as a site of its own. */
const DEPLOY_TARGETS = listDeployTargets();

/**
 * The HTML shell that is a host's home page.
 *
 * @param packageDirectory - The deploy target's package directory.
 * @returns The repo-relative path of its `index.html` (`app.html` for SvelteKit, `src/index.html` for
 *   Angular).
 */
function homeShell(packageDirectory: string): string {
	return ['index.html', 'src/index.html', 'src/app.html']
		.map((name) => `packages/${packageDirectory}/${name}`)
		.find((path) => existsSync(resolve(REPO_ROOT, path))) ?? `packages/${packageDirectory}/index.html`;
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

/** The badge's ground color, `--gray-0`. */
const BADGE_GROUND: readonly [number, number, number] = [0x0b, 0x0a, 0x09];

/** The two PNG scanline filters the favicons use: `sharp` writes None, the browser captures Up. */
const SCANLINE_FILTERS = { none: 0, up: 2 } as const;

/**
 * Decode an 8-bit RGBA, non-interlaced PNG into its pixels.
 *
 * @remarks
 * Every favicon is that format, and every scanline in them uses the None or the Up filter, as written by
 * both `sharp` and the browser captures. Anything else throws rather than decoding wrongly.
 *
 * @param png - The file.
 * @returns The image's width and its pixels, four bytes each, row by row.
 */
function decodeRgbaPng(png: Buffer): { readonly pixels: Buffer; readonly width: number } {
	const [width, height] = pngSize(png);
	const [bitDepth, colorType, , , interlace] = [24, 25, 26, 27, 28].map((offset) => png.readUInt8(offset));

	if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
		throw new Error(`expected an 8-bit RGBA non-interlaced PNG, got depth ${String(bitDepth)} type ${String(colorType)}`);
	}

	// The image data chunks, by their PNG chunk type. cspell:ignore IDAT
	const data: Buffer[] = [];

	for (let offset = 8; offset < png.length; offset += png.readUInt32BE(offset) + 12) {
		if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
			data.push(png.subarray(offset + 8, offset + 8 + png.readUInt32BE(offset)));
		}
	}

	const raw = inflateSync(Buffer.concat(data));
	const stride = width * 4;
	const pixels = Buffer.alloc(stride * height);

	for (let row = 0; row < height; row++) {
		const filter = raw.readUInt8(row * (stride + 1));

		if (filter !== SCANLINE_FILTERS.none && filter !== SCANLINE_FILTERS.up) {
			throw new Error(`scanline ${String(row)} uses PNG filter ${String(filter)}, which this decoder does not read`);
		}
		for (let column = 0; column < stride; column++) {
			const up = filter === SCANLINE_FILTERS.up && row > 0 ? pixels.readUInt8((row - 1) * stride + column) : 0;

			pixels.writeUInt8((raw.readUInt8(row * (stride + 1) + 1 + column) + up) & 0xff, row * stride + column);
		}
	}

	return { pixels, width };
}

/**
 * The pixel left of the mark, halfway down: the badge's dark ground, and empty in the glyph.
 *
 * @remarks
 * At 15% of the width the point is inside the badge's circle but outside its Z and its rings, and well
 * clear of the glyph's Z and of its glow.
 *
 * @param png - A square favicon.
 * @returns Its `[r, g, b, a]` there.
 */
function besideTheMark(png: Buffer): readonly number[] {
	const { pixels, width } = decodeRgbaPng(png);
	const offset = (Math.floor(width / 2) * width + Math.floor(width * 0.15)) * 4;

	return [...pixels.subarray(offset, offset + 4)];
}

/**
 * Whether a favicon is the badge: opaque `--gray-0` beside the mark.
 *
 * @param png - A square favicon.
 * @returns `true` for the badge.
 */
function isBadge(png: Buffer): boolean {
	const [red, green, blue, alpha] = besideTheMark(png);

	return alpha === 255 && [red, green, blue].every((channel, index) => Math.abs((channel ?? 0) - (BADGE_GROUND[index] ?? 0)) <= 2);
}

/**
 * The images packed in an ICO file, in directory order.
 *
 * @param ico - The file.
 * @returns Each image's bytes.
 */
function icoImages(ico: Buffer): readonly Buffer[] {
	return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
		const entry = 6 + 16 * index;

		return ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
	});
}

/**
 * A PNG's width and height, from its IHDR chunk.
 *
 * @param png - The file.
 * @returns `[width, height]`.
 */
function pngSize(png: Buffer): readonly [number, number] {
	return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('the rosters this suite reads', () => {
	it('parses the icon set, the sync targets, the site’s files and the deploy targets', () => {
		expect(ICON_SET).toContain('favicon.ico');
		expect(ICON_SET.length).toBeGreaterThanOrEqual(10);
		expect(SYNC_TARGETS.length).toBe(7);
		expect(SYNC_TARGETS.every(({ assets }) => assets.length > ICON_SET.length)).toBe(true);
		expect(SITE_BRAND_FILES.length).toBeGreaterThan(ICON_SET.length);
		expect(DEPLOY_TARGETS.length).toBe(8);
	});

	it('syncs into every deployed app, and the site emits the rest: eight hosts, none left out', () => {
		const appDirectories = DEPLOY_TARGETS.filter((target) => target.packageDirectory !== 'site').map((target) => target.packageDirectory);

		expect(SYNC_TARGETS.map(({ dir }) => dir.replace(/^packages\/([^/]+)\/.*$/u, '$1')).sort()).toEqual(appDirectories.sort());
	});
});

describe('brand assets', () => {
	it('carries exactly the files the design system exports for it', () => {
		expect(readdirSync(resolve(REPO_ROOT, BRAND_ASSETS)).sort()).toEqual(Object.keys(DESIGN_SYSTEM_SOURCES).sort());
	});

	it.each(Object.entries(DESIGN_SYSTEM_SOURCES))('%s matches its design-system source', (name, source) => {
		expect(sameBytes(join(BRAND_ASSETS, name), source), `${BRAND_ASSETS}/${name} differs from ${source}`).toBe(true);
	});

	it.each(SYNC_TARGETS.flatMap(({ assets, dir }) => assets.map((name) => [dir, name] as const)))('%s/%s matches the brand package', (dir, name) => {
		// The assertion the sync script's `--check` makes from the CLI, made again where every gate runs.
		expect(sameBytes(join(dir, name), join(BRAND_ASSETS, name)), `${dir}/${name} is stale: run node scripts/sync-brand-assets.mjs`).toBe(true);
	});

	it('serves the whole icon set from every host', () => {
		for (const { assets, dir } of SYNC_TARGETS) {
			expect(ICON_SET.filter((name) => !assets.includes(name)), dir).toEqual([]);
		}
		expect(ICON_SET.filter((name) => !SITE_BRAND_FILES.includes(name)), 'packages/site/vite.config.ts BRAND_FILES').toEqual([]);
	});

	it('keeps the two marks DIFFERENT, which is the whole hazard', () => {
		// If these ever became the same file the mix-up would stop mattering — and so would this suite.
		expect(sameBytes(`${BRAND_ASSETS}/mark.svg`, `${BRAND_ASSETS}/favicon.svg`)).toBe(false);
	});

	it('has no component source reaching for the favicon', () => {
		// `/favicon.svg` belongs in exactly one place — the `<link rel="icon">` of an app's HTML shell.
		// Anywhere in component source it is a header or a landing card about to render the ring-less mark.
		const offenders = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((name) => name.startsWith('examples-'))
			.map((name) => resolve(REPO_ROOT, 'packages', name, 'src'))
			.filter((dir) => existsSync(dir))
			.flatMap(sourceFiles)
			.filter((file) => !file.endsWith('.html'))
			.filter((file) => readFileSync(file, 'utf8').includes('/favicon.svg'))
			.map((file) => file.replace(`${REPO_ROOT}/`, ''));

		expect(offenders, 'component source must use /mark.svg — /favicon.svg is the 16px variant').toEqual([]);
	});

	it('has the sync script covering every app that serves the full mark', () => {
		const onDisk = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((name) => name.startsWith('examples-'))
			.flatMap((name) => ['public', 'static'].map((dir) => `packages/${name}/${dir}`))
			.filter((dir) => existsSync(resolve(REPO_ROOT, dir, 'mark.svg')));

		expect(onDisk.sort()).toEqual(SYNC_TARGETS.filter(({ assets }) => assets.includes('mark.svg')).map(({ dir }) => dir).sort());
	});
});

describe('the icon set', () => {
	it.each([
		['favicon-16.png', 16],
		['favicon-32.png', 32],
		['favicon-48.png', 48],
		['favicon-96.png', 96],
		['icon-192.png', 192],
		['icon-512.png', 512],
		['icon-512-maskable.png', 512],
		['apple-touch-icon.png', 180],
	] as const)('%s is a square PNG of %i px', (name, size) => {
		expect(pngSize(bytes(`${BRAND_ASSETS}/${name}`))).toEqual([size, size]);
	});

	it('packs the badge at 16, 32 and 48 px into favicon.ico, its 48 px image the 48 px favicon itself', () => {
		const ico = bytes(`${BRAND_ASSETS}/favicon.ico`);
		const images = icoImages(ico);

		expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
		expect(images.map((image) => pngSize(image))).toEqual([[16, 16], [32, 32], [48, 48]]);
		expect(images.map((image) => isBadge(image)), 'every image in favicon.ico is the badge').toEqual([true, true, true]);
		expect(images[2]?.equals(bytes(`${BRAND_ASSETS}/favicon-48.png`))).toBe(true);
	});

	it.each([
		['favicon-48.png', true],
		['favicon-96.png', true],
		['apple-touch-icon.png', true],
		['icon-192.png', true],
		['favicon-16.png', false],
		['favicon-32.png', false],
	] as const)('%s is the badge: %s', (name, shouldBeBadge) => {
		// The badge reads on a white search-results page, the glyph in a browser tab.
		expect(isBadge(bytes(`${BRAND_ASSETS}/${name}`))).toBe(shouldBeBadge);
	});

	it('tells the glyph from the badge by a transparent pixel, not by a decoding failure', () => {
		// Non-vacuous: the glyph is genuinely empty beside its mark, rather than a pixel this suite misread.
		expect(besideTheMark(bytes(`${BRAND_ASSETS}/favicon-32.png`))[3]).toBeLessThan(32);
	});

	it('has a maskable icon of its own: full bleed, the mark inside the safe circle', () => {
		const source = text(`${LOGOMARK}/svg/icon-maskable.svg`);

		expect(sameBytes(`${BRAND_ASSETS}/icon-512-maskable.png`, `${BRAND_ASSETS}/icon-512.png`)).toBe(false);
		expect(source).toContain('<rect width="512" height="512" fill="#0B0A09"></rect>');
		// The mark spans 14–88 of its 100-unit box; scaled by 3.6 from 76 its corners stay within the
		// 204.8 px radius of the safe circle around the center.
		expect(source).toContain('transform="translate(76, 76) scale(3.6)"');
	});

	it('describes the app in a manifest that lists the icons it serves, in the brand’s surface color', () => {
		const manifest = JSON.parse(text(`${BRAND_ASSETS}/site.webmanifest`)) as {
			readonly background_color: string;
			readonly icons: readonly { readonly purpose?: string; readonly sizes: string; readonly src: string }[];
			readonly name: string;
			readonly theme_color: string;
		};
		const surface = /--gray-0: (#[0-9a-f]{6});/u.exec(text('packages/brand/src/tokens.css'))?.[1]?.toUpperCase();

		expect(manifest.name).toBe('Filter EngineZ');
		expect(surface).toBe('#0B0A09');
		expect([manifest.background_color, manifest.theme_color]).toEqual([surface, surface]);
		expect(manifest.icons.map((icon) => icon.src.slice(1)).every((name) => ICON_SET.includes(name))).toBe(true);
		expect(manifest.icons.map((icon) => `${icon.sizes}${icon.purpose === undefined ? '' : ` ${icon.purpose}`}`)).toEqual(
			expect.arrayContaining(['192x192', '512x512', '512x512 maskable']),
		);
	});
});

describe('every host’s home page', () => {
	it.each(DEPLOY_TARGETS.map((target) => target.packageDirectory))('%s links the whole icon set and the theme color', (packageDirectory) => {
		const shell = text(homeShell(packageDirectory));
		const root = packageDirectory === 'examples-sveltekit' ? '%sveltekit.assets%' : '';
		const missing = ICON_LINKS.map((tag) => tag.replace('{root}', root)).filter((tag) => !shell.includes(tag));

		expect(missing, homeShell(packageDirectory)).toEqual([]);
		expect(shell).toContain('<meta name="theme-color" content="#0B0A09" />');
	});
});
