/**
 * Only the development mock API turns the dataset boots' corpus stream on.
 *
 * @remarks
 * `GET /api/<dataset>` is served by MSW in development and by nothing that is deployed, so the books
 * and real-estate boots stream from it only after `announceCorpusApi()` has run
 * (`examples-shared/src/data/corpusApi.ts`). Two ways to break that, neither of which any other gate
 * sees:
 *
 * - **The mock starter stops announcing.** Every development boot then silently imports its bundled
 *   corpus instead of streaming: the pages still work and the end-to-end suite still passes, but the
 *   streaming progress the boot screens narrate never happens. `startMockServiceWorker()` is browser
 *   wiring that no unit test runs, so this pins the call, after the service worker has started.
 * - **Something else announces.** An announcement reachable from a production build puts the
 *   wasted `/api/<dataset>` request back on every dataset page. So the starter must be the only
 *   module that calls it, and the starter itself loads only behind each app's development guard.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** The one module allowed to announce the API. */
const MOCK_STARTER = 'packages/examples-shared/src/mocks/startMockServiceWorker.ts';

/** A call of the announcement, as opposed to its declaration or an import of it. */
const ANNOUNCE_CALL = /(?<!function\s+)\bannounceCorpusApi\(\)/u;

/** Source files that could hold app code. Tests are exempt: they announce to exercise the stream. */
const SOURCE_FILE = /^packages\/[^/]+\/src\/.+\.(?:svelte|ts|tsx|vue)$/u;

/** A test or spec file. */
const TEST_FILE = /\.(?:spec|test)\.tsx?$/u;

describe('the corpus API announcement', () => {
	const callers = walkRepoFiles()
		.filter((path) => SOURCE_FILE.test(path) && !TEST_FILE.test(path))
		.filter((path) => ANNOUNCE_CALL.test(readFileSync(resolve(REPO_ROOT, path), 'utf8')));

	it('is made by the development mock starter and by nothing else', () => {
		expect(
			callers,
			`only ${MOCK_STARTER} may call announceCorpusApi(); a call anywhere else can reach a production build`,
		).toEqual([MOCK_STARTER]);
	});

	it('comes after the mock service worker has started', () => {
		const source = readFileSync(resolve(REPO_ROOT, MOCK_STARTER), 'utf8');
		const started = source.indexOf('await worker.start(');
		const announced = source.search(ANNOUNCE_CALL);

		expect(started, `${MOCK_STARTER} no longer awaits worker.start(…)`).toBeGreaterThan(-1);
		expect(
			announced,
			'announce the corpus API only once the service worker controls the page, or the first requests miss it',
		).toBeGreaterThan(started);
	});
});
