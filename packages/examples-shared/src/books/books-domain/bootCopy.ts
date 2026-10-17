/**
 * The books demo's cold-start sentence — the one string three verticals share.
 *
 * @remarks
 * `examples-shared/boot-caption` owns the caption's three STATES and deliberately takes the
 * pre-stream sentence as a parameter, because a route knows things the caption does not: whether a
 * worker is spinning up, whether a server is being reached, whether anything is streaming at all.
 * That seam is right. What it does not imply is that each vertical should author the sentence.
 *
 * These three books routes await the engine on the main thread without subscribing to the boot's
 * progress stream, so they render the idle state and nothing else:
 *
 *   - `examples-sveltekit/src/routes/books/+page.svelte`
 *   - `examples-vue/src/pages/BooksPage.vue`
 *   - `examples-vanilla/src/pages/booksPage.ts`
 *
 * Angular's root component shows the same idle state while its `/books` resolver boots the engine
 * (`examples-angular/src/app/app.component.ts`). It reads the sentence through
 * `examples-shared/boot-caption`, which re-exports this module, because this barrel would bring the
 * engine into the app's startup chunk with it.
 *
 * `bootCaptionSingleSource.test.ts` pins only the phrases the shared caption module owns, so it
 * cannot see a sentence that module never says. Agreement between independently written copies
 * would be a coincidence with a shelf life, so the sentence lives here, beside the domain logic those
 * same three routes already share.
 *
 * The React apps do not read this: their `<DatasetRoute>` carries a progress stream for every
 * dataset, so books boots through the streaming states rather than resting on an idle sentence.
 *
 * @packageDocumentation
 */

/**
 * What the books routes say while the engine builds.
 *
 * @remarks
 * An override rather than `DEFAULT_IDLE_CAPTION`, whose wording names a worker spin-up: books boots
 * on the main thread, and naming a worker that is not being started is the same class of error as
 * a count frozen on its final value while the index builds — copy describing something other than
 * what is happening. (Described rather than quoted, because `bootCaptionSingleSource.test.ts` does not
 * exempt comments, deliberately — an exception list is the thing that eventually admits a real
 * offender.)
 */
export const BOOKS_BOOT_IDLE_CAPTION = 'Booting the books engine…';

/**
 * The plural record noun the books caption interpolates.
 *
 * @remarks
 * Here rather than at each call site for the same reason as the sentence above, and it matters more
 * than it looks: the noun is what makes the STREAMING and INDEXING states read correctly if a books
 * route ever gains a progress stream, and a route that passed `'records'` would diverge silently
 * from the five that say `books`.
 */
export const BOOKS_RECORD_NOUN = 'books';
