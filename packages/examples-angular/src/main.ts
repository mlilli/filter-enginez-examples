/**
 * Angular app entry — bootstraps the standalone root component, **zoneless**.
 *
 * @remarks
 * ### Why zoneless
 *
 * `zone.js` exists to notice that something *might* have changed by monkey-patching every async
 * browser API. This app never needs that inference, because both of its read paths announce their own
 * changes: the `async` pipe calls `markForCheck()` on every emission, and `toSignal` produces a real
 * signal that the framework tracks directly. So the zone would be ~30KB of patched globals earning
 * nothing — and dropping it removes a whole class of "why did change detection run 40 times" puzzles
 * on the worker-backed wine route, where every read is a Comlink round trip.
 *
 * Note the absence of a `polyfills` entry in `angular.json` for the same reason: no `zone.js` import.
 *
 * ### Why the engine is NOT provided here
 *
 * Booting the books corpus takes real work (acceleration init + index build), and the landing page has
 * no business waiting on it. So the engine is provided at the `/books` route instead, via a resolver —
 * see `app.routes.ts`. This file stays synchronous and the first paint is immediate.
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
	provideRouter,
	withComponentInputBinding,
	withNavigationErrorHandler,
} from '@angular/router';

import { AppComponent } from './app/app.component.js';
import { routes } from './app/app.routes.js';

/**
 * Start MSW in dev before bootstrapping, so the books boot's corpus stream (`/api/books?...`) has an
 * API to hit the moment the `/books` route resolver fires.
 *
 * @remarks
 * The registration itself is shared across all six verticals
 * (`@filter-enginez/examples-shared/mocks`); only this guard is per-app, because only the guard is
 * framework-specific.
 *
 * **A build-time constant, not `isDevMode()`.** `@angular/build` does not define Vite's
 * `import.meta.env`, so the other five verticals' `import.meta.env.DEV` guard isn't available here.
 * `isDevMode()` would work at runtime, but a runtime check keeps the `import()` in the bundle, and the
 * production build would emit a ~290 kB MSW chunk that is never fetched. `shouldStartMockServiceWorker`
 * (declared in `build-constants.d.ts`) is instead replaced with a literal by `angular.json`'s `define`:
 * `false` in the base build options, which production inherits, and `true` in the development
 * configuration. esbuild removes the `if (false)` branch with its `import()`, so production emits no
 * mock code at all — the same outcome the other verticals get.
 *
 * Bootstrap is sequenced AFTER the await: `/books` boots its engine in a route resolver, and a
 * corpus fetch that lands before the service worker controls the page falls through to the bundled
 * fallback — silently, since that fallback is a supported path rather than an error. The shared
 * starter never throws.
 */
async function enableMocking(): Promise<void> {
	// The whole branch, `import()` included, is the unit esbuild drops when the constant is `false`.
	if (shouldStartMockServiceWorker) {
		const { startMockServiceWorker } = await import('@filter-enginez/examples-shared/mocks');

		await startMockServiceWorker();
	}
}

void enableMocking()
	.then(async () =>
		bootstrapApplication(AppComponent, {
			providers: [
				provideZonelessChangeDetection(),
				provideRouter(
					routes,
					withComponentInputBinding(),
					// A rejected resolver or a failed `loadComponent` CANCELS the navigation, and a cancelled
					// navigation looks identical to a click that did nothing — you simply stay on the page you
					// were on. That is a miserable thing to debug, so every navigation failure gets shouted at
					// the console rather than swallowed.
					withNavigationErrorHandler(({ error }: { error: unknown }) => {
						console.error('[filter-enginez] navigation failed', error);
					}),
				),
			],
		}),
	)
	.catch((error: unknown) => {
		// Bootstrap failure is unrecoverable; surfacing it beats a silently blank page. The mock-startup
		// step shares this handler — it never throws on its own, but its dynamic import can.
		console.error('[filter-enginez] Angular bootstrap failed', error);
	});
