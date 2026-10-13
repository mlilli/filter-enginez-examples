/**
 * SvelteKit's SSR externals — the two entries whose absence breaks a production build silently.
 *
 * @remarks
 * `examples-sveltekit` is the only vertical that renders server-side, so it is the only one whose
 * Vite config decides what gets BUNDLED into a Node bundle rather than left for Node to load. Two of
 * its entries are load-bearing, and both failure modes are production-build-only: the dev server never
 * reproduces either, so a change that breaks one looks healthy locally and fails only at `pnpm build`.
 * This guard reports it at unit-test speed and names the setting at fault.
 *
 * ### `roaring-wasm` must stay EXTERNAL
 *
 * A CommonJS package whose Node entry calls `require('fs')` at module scope. `noExternal` on
 * `@filter-enginez/*` pulls `core` in, `core` imports this, and bundled, it lands where the bundler's
 * CJS `__require` shim is **self-recursive**: once `__require` is the Proxy, its own `get` trap reads
 * `__require[b]`, so the first property access recurses until the stack dies. The build fails with
 * `RangeError: Maximum call stack size exceeded` and a stack of nothing but `Object.get`.
 *
 * Externalizing hands it to Node, which loads CommonJS natively. It is also semantically right: the
 * package `readFileSync`s its WASM binary from disk, which needs the package ON disk.
 *
 * ### The workspace packages must stay NON-external
 *
 * The mirror image. Left external, Node's ESM loader resolves their source `.js`-extension imports
 * (the nodenext convention — `import './rules/index.js'` where the file is `index.ts`) against the
 * filesystem and fails outright.
 *
 * So the two settings pull in opposite directions and both matter; asserting one without the other
 * would let a well-meaning "just externalize everything" change through.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = readFileSync(
	resolve(REPO_ROOT, 'packages/examples-sveltekit/vite.config.ts'),
	'utf8',
);

/** The `ssr` block's source, so an `external` elsewhere in the config cannot satisfy these. */
function ssrBlock(): string {
	return /ssr:\s*\{([\s\S]*?)\n\t\},/u.exec(CONFIG)?.[1] ?? '';
}

describe('examples-sveltekit SSR externals', () => {
	it('parses a non-empty ssr block', () => {
		// Guard on the parser: if the regex stopped matching, both assertions below would run against
		// an empty string and the `external` one would fail loudly — but the `noExternal` one would
		// also fail, and two failures from one cause read as two problems. This names the cause.
		expect(ssrBlock().length).toBeGreaterThan(0);
	});

	it('keeps roaring-wasm external so Node loads it as CommonJS', () => {
		expect(
			/external:\s*\[[^\]]*'roaring-wasm'/su.test(ssrBlock()),
			"ssr.external must list 'roaring-wasm' — bundling it hits a self-recursive CJS __require shim",
		).toBe(true);
	});

	it('keeps the workspace packages NON-external so Vite resolves their .js source imports', () => {
		expect(
			/noExternal:\s*\[[^\]]*@filter-enginez/su.test(ssrBlock()),
			'ssr.noExternal must cover @filter-enginez/* — Node cannot resolve their nodenext .js imports',
		).toBe(true);
	});

	it('declares roaring-wasm as a dependency, since externalizing means Node must resolve it', () => {
		// The other half of the arrangement, and the half a config-only assertion would miss.
		// `roaring-wasm` is `core`'s dependency; the built server chunk lives in THIS package and imports
		// it by bare specifier, so under pnpm's strict layout it has to be declared here too.
		const pkg = JSON.parse(
			readFileSync(resolve(REPO_ROOT, 'packages/examples-sveltekit/package.json'), 'utf8'),
		) as { dependencies?: Record<string, string> };

		expect(pkg.dependencies?.['roaring-wasm']).toBeDefined();
	});
});
