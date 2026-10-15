#!/usr/bin/env node
// cspell:ignore librsvg — the SVG renderer sharp is built on.
/**
 * `rasterize-brand-icons` — render the icon exports the design system's SVG sources do not ship as
 * PNG, and pack the favicon ICO.
 *
 *     node scripts/rasterize-brand-icons.mjs            # write the exports
 *     node scripts/rasterize-brand-icons.mjs --check    # fail if a committed export differs from a fresh render
 *
 * @remarks
 * The design system's logomark folder (`docs/branding/design-system/assets/logomark/`) is the
 * canonical home of every brand image: vector sources in `svg/`, raster exports in `png/`. Most exports
 * were captured from `rasterize.html` in a browser. This script produces the four a site's icon set
 * takes from a render rather than a capture, from the canonical vectors, byte for byte the same on every
 * run:
 *
 * | Export                      | Source                     | How                                         |
 * | --------------------------- | -------------------------- | ------------------------------------------- |
 * | `png/favicon-48.png`        | `svg/apple-touch-icon.svg` | rendered at 48 × 48                         |
 * | `png/favicon-96.png`        | `svg/apple-touch-icon.svg` | rendered at 96 × 96                         |
 * | `png/icon-512-maskable.png` | `svg/icon-maskable.svg`    | rendered at 512 × 512                       |
 * | `ico/favicon.ico`           | `svg/apple-touch-icon.svg` | rendered at 16, 32 and 48 px, packed as ICO |
 *
 * **Two favicon artworks, by where the icon is seen.** A search result shows a site's icon at 16 to 48
 * px on a white or light-gray page, and takes it from the largest suitable square `<link rel="icon">`
 * (a multiple of 48 px) or from `/favicon.ico`. The transparent cyan glyph is faint there, so those
 * files are the dark circular badge, `svg/apple-touch-icon.svg`, the artwork of the 180, 192 and 512 px
 * icons: `favicon-48.png`, `favicon-96.png` and every image in `favicon.ico`. A browser tab shows the
 * icon at 16 or 32 px on a tab strip that is as often dark as light, and draws `favicon.svg` (the glyph)
 * where it can. `favicon-16.png` and `favicon-32.png` stay the glyph, captured like the other glyph
 * exports: at 16 px its Z stands about 11 px tall, where the badge's stands about 8 px inside a circle
 * that disappears into a dark tab strip, and a tab that falls back from the SVG to a PNG keeps the same
 * mark.
 *
 * **The renderer is librsvg, through `sharp`,** which the workspace already installs as a dependency of
 * Wrangler's local runtime (`wrangler` → `miniflare` → `sharp`), so no package is added for a task run
 * once per brand change. The lockfile pins its version, and with it the renderer's output. The script
 * resolves it along that chain rather than by name, because pnpm does not link a transitive dependency
 * at the root. librsvg renders the CSS `drop-shadow()` glow the sources use, so a render matches the
 * browser captures beside it.
 *
 * **The ICO holds PNG images**, the form every browser since 2006 reads: the badge rendered at 16 and
 * 32 px, and the committed 48 px export itself, byte for byte.
 *
 * After running it, copy the exports into the brand package and the apps with
 * `node scripts/sync-brand-assets.mjs`; `tests/tooling/brandAssets.test.ts` holds every copy to its
 * source.
 *
 * @packageDocumentation
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The repository root. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The design system's logomark folder, which holds the sources and receives the exports. */
const LOGOMARK = join(ROOT, 'docs/branding/design-system/assets/logomark');

/**
 * The one `sharp` call shape this script makes.
 *
 * @typedef {(input: Buffer, options: { density: number }) => {
 *   resize: (width: number, height: number) => { png: (options: { compressionLevel: number }) => { toBuffer: () => Promise<Buffer> } };
 * }} SharpFactory
 */

/**
 * One image rendered from an SVG source.
 *
 * @typedef {{ readonly output: string; readonly size: number; readonly source: string }} RenderedExport
 */

/** The dark circular badge: the artwork of the search-result favicons and of every image in the ICO. */
const BADGE_SOURCE = 'svg/apple-touch-icon.svg';

/** @type {readonly RenderedExport[]} */
const RENDERED_EXPORTS = [
	{ output: 'png/favicon-48.png', size: 48, source: BADGE_SOURCE },
	{ output: 'png/favicon-96.png', size: 96, source: BADGE_SOURCE },
	{ output: 'png/icon-512-maskable.png', size: 512, source: 'svg/icon-maskable.svg' },
];

/** The image sizes the ICO packs, smallest first, each the badge rendered at that size, and its path. */
const ICO_SIZES = [16, 32, 48];
const ICO_OUTPUT = 'ico/favicon.ico';

/**
 * Load `sharp` from where the workspace installs it: a dependency of `miniflare`, itself a dependency
 * of the root's `wrangler`.
 *
 * @returns The `sharp` factory.
 */
async function loadSharp() {
	const fromRoot = createRequire(join(ROOT, 'package.json'));
	const fromWrangler = createRequire(fromRoot.resolve('wrangler/package.json'));
	const fromMiniflare = createRequire(fromWrangler.resolve('miniflare'));
	const module = /** @type {{ default: SharpFactory }} */ (await import(pathToFileURL(fromMiniflare.resolve('sharp')).href));

	return module.default;
}

/**
 * Render an SVG to a square PNG.
 *
 * @param {SharpFactory} sharp - The renderer.
 * @param {RenderedExport} entry - What to render.
 * @returns {Promise<Buffer>} The PNG.
 */
async function render(sharp, entry) {
	const svg = readFileSync(join(LOGOMARK, entry.source));
	// The sources declare 100, 180 or 512 px. Rendering at a density that makes even the smallest one at
	// least as large as the target, then resizing down, keeps every export sharp whatever size its source
	// declares.
	const density = Math.max(72, Math.ceil((72 * entry.size) / 100));

	return sharp(svg, { density }).resize(entry.size, entry.size).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Pack PNG images into an ICO file.
 *
 * @remarks
 * The layout is a 6-byte header (reserved 0, type 1, image count), one 16-byte directory entry per
 * image (width and height, 0 meaning 256; no palette; one plane; 32 bits per pixel; the data's length
 * and offset), then the PNG files themselves, in directory order.
 *
 * @param {readonly Buffer[]} images - The images, each a PNG file.
 * @returns {Buffer} The ICO file.
 */
export function packIco(images) {
	const header = Buffer.alloc(6);

	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);

	let offset = header.length + 16 * images.length;
	const entries = images.map((png) => {
		const entry = Buffer.alloc(16);
		// A PNG's width and height are the big-endian words at bytes 16 and 20 of its IHDR chunk.
		const width = png.readUInt32BE(16);
		const height = png.readUInt32BE(20);

		entry.writeUInt8(width >= 256 ? 0 : width, 0);
		entry.writeUInt8(height >= 256 ? 0 : height, 1);
		entry.writeUInt8(0, 2);
		entry.writeUInt8(0, 3);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += png.length;

		return entry;
	});

	return Buffer.concat([header, ...entries, ...images]);
}

/**
 * Render every export, then write it or compare it with the committed file.
 *
 * @param {boolean} isCheckMode - Compare instead of writing.
 * @returns {Promise<readonly string[]>} The exports that differ (check mode) or were written.
 */
async function run(isCheckMode) {
	const sharp = await loadSharp();
	/** @type {[string, Buffer][]} */
	const outputs = [];

	for (const entry of RENDERED_EXPORTS) {
		outputs.push([entry.output, await render(sharp, entry)]);
	}
	/** @type {Buffer[]} */
	const icoImages = [];

	// The 48 px image renders exactly as `png/favicon-48.png` does: the same source, size and encoder.
	for (const size of ICO_SIZES) {
		icoImages.push(await render(sharp, { output: ICO_OUTPUT, size, source: BADGE_SOURCE }));
	}
	outputs.push([ICO_OUTPUT, packIco(icoImages)]);

	/** @type {string[]} */
	const changed = [];

	for (const [path, body] of outputs) {
		const target = join(LOGOMARK, path);
		let current = null;

		try {
			current = readFileSync(target);
		} catch {
			// Absent: it differs.
		}
		if (current !== null && current.equals(body)) {
			continue;
		}
		changed.push(path);
		if (!isCheckMode) {
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, body);
		}
	}

	return changed;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const isCheckMode = process.argv.includes('--check');
	const changed = await run(isCheckMode);

	if (isCheckMode && changed.length > 0) {
		console.error(`✗ ${String(changed.length)} icon export(s) differ from a fresh render:\n   ${changed.join('\n   ')}`);
		console.error('   run: node scripts/rasterize-brand-icons.mjs');
		process.exit(1);
	}
	console.log(
		isCheckMode
			? `✓ ${String(RENDERED_EXPORTS.length + 1)} icon export(s) match a fresh render`
			: `✓ ${String(changed.length)} icon export(s) written to docs/branding/design-system/assets/logomark`,
	);
}
