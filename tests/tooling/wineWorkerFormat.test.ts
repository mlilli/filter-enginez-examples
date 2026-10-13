/**
 * Every Vite vertical that serves `/wine` must build its worker as an ES module.
 *
 * @remarks
 * ### The failure this pins
 *
 * `wine.worker.ts` reaches `@filter-enginez/mock-data/wine`, whose `data.ts` opens with a **top-level
 * await** (`export const wines = await loadDefaultWines()`). Vite defaults workers to the `iife`
 * output format, which cannot express that, so `vite build` stops with:
 *
 * ```text
 * [UNSUPPORTED_FEATURE] Top-level await is currently not supported with the 'iife' output format
 * ```
 *
 * **The dev server does not reproduce it.** Vite serves workers as ES modules in dev, so a wine route
 * without this config looks completely healthy — filters work, the worker tier engages, nothing warns.
 * Only a production build sees it.
 *
 * ### Why a config assertion rather than a build
 *
 * CI's `pnpm build` does catch the failure, but late and indirectly. Building five apps is minutes;
 * reading five config files is milliseconds, and the invariant really is the config line. A build
 * can also fail for unrelated reasons, which would make this suite report a problem it is not about.
 *
 * Comlink needs real module workers for its own import graph too, so `'es'` is load-bearing twice.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every VITE vertical that serves `/wine`.
 *
 * @remarks
 * Angular is deliberately absent: it serves `/wine` but builds with `@angular/build`, which has no
 * `worker.format` notion and spawns through its own `wineBoot.ts` rather than a `?worker` import.
 * The roster is cross-checked against the shared registry below, so a sixth Vite vertical growing a
 * wine route cannot quietly skip this.
 */
const VITE_WINE_VERTICALS: readonly string[] = [
	'examples-react-plain',
	'examples-react-rtk',
	'examples-sveltekit',
	'examples-vanilla',
	'examples-vue',
];

/** Read a package's Vite config source. */
function viteConfig(pkg: string): string {
	return readFileSync(resolve(REPO_ROOT, `packages/${pkg}/vite.config.ts`), 'utf8');
}

describe('wine worker output format', () => {
	it.each(VITE_WINE_VERTICALS)('%s builds its worker as an ES module', (pkg) => {
		const source = viteConfig(pkg);

		// Matched as a `worker` block containing `format: 'es'` rather than the bare string, so a
		// `format: 'es'` belonging to some other option cannot satisfy it.
		expect(
			/worker:\s*\{[^}]*format:\s*'es'/su.test(source),
			`${pkg}/vite.config.ts must set worker.format to 'es' — its wine worker uses top-level await`,
		).toBe(true);
	});

	it('covers every Vite vertical the registry says serves /wine', () => {
		// The roster guard. `compareLinks` and the page headers both read this registry, so it is the
		// repo's answer to "who serves what" — and a hand-kept list here that fell behind it would go
		// green while covering one fewer app, which is the failure `brandAssets.test.ts` describes.
		const registry = readFileSync(
			resolve(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts'),
			'utf8',
		);
		const serving = [...registry.matchAll(/id: '([^']+)',[\s\S]*?routes: \[([^\]]*)\]/gu)]
			.filter(([, , routes]) => (routes ?? '').includes("'/wine'"))
			.map(([, id]) => `examples-${id ?? ''}`)
			// Angular is not a Vite app; see VITE_WINE_VERTICALS.
			.filter((pkg) => pkg !== 'examples-angular');

		expect([...serving].sort()).toEqual([...VITE_WINE_VERTICALS].sort());
	});
});
