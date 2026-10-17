/**
 * `corpusApi` — whether this page has a `GET /api/<dataset>` endpoint to stream a corpus from.
 *
 * @remarks
 * The paginated corpus endpoint exists in exactly one place: the development mock API, which
 * `startMockServiceWorker()` (`../mocks`) registers in each app's dev build before its first render.
 * No deployed site serves it. On Cloudflare, the apps that run a Worker send every `/api/*` request to
 * `examples-server`'s handler, which has no `/<dataset>` route and answers 404; the static-only apps
 * answer it with their single-page `index.html`. A boot that tried the stream first would therefore
 * spend a round trip — and, on the Worker apps, a billed request — on every dataset page, only to fall
 * back to the bundled corpus it was always going to use.
 *
 * So the stream is opt-in: the mock starter announces the API once its service worker controls the
 * page ({@link announceCorpusApi}), and {@link loadDefaultTierCorpus} streams only after that
 * announcement. Everywhere else the boot imports its bundled corpus straight away, with no request.
 *
 * Module state rather than an argument threaded through every boot: the books and real-estate boots
 * are reached from six apps through several layers, and the one fact they need is the one the mock
 * starter already knows.
 *
 * @packageDocumentation
 */

/** Set once the development mock API is controlling the page. */
let isCorpusApiAnnounced = false;

/**
 * Record that `GET /api/<dataset>` is served on this page, so dataset boots stream their corpus over it.
 *
 * @remarks
 * Called by `startMockServiceWorker()` after its service worker has started. Idempotent, and there is
 * no way back: the mock API does not go away for the life of the page.
 */
export function announceCorpusApi(): void {
	isCorpusApiAnnounced = true;
}

/**
 * Whether `GET /api/<dataset>` is served on this page.
 *
 * @returns `true` once {@link announceCorpusApi} has run; `false` in every production build.
 */
export function hasCorpusApi(): boolean {
	return isCorpusApiAnnounced;
}
