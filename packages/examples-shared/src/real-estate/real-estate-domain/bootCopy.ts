/**
 * The real-estate demo's cold-start sentence and record noun, shared by the non-React verticals.
 *
 * @remarks
 * The sibling of `books-domain/bootCopy.ts`, and the reason both exist is the same: `boot-caption`
 * owns the three STATES and takes the pre-stream sentence as a parameter, because only the route
 * knows whether a worker is starting, a server is being reached, or nothing is streaming at all.
 * That seam is right; it does not follow that each vertical should author the sentence.
 *
 * Real estate streams ~10k listings over `/api/real-estate`, so unlike books it does reach the
 * streaming and indexing states. Its idle sentence and its plural noun live here so these routes pass
 * the same literal rather than three independent ones:
 *
 *   - `examples-sveltekit/src/routes/real-estate/+page.svelte`
 *   - `examples-vue/src/pages/RealEstatePage.vue`
 *   - `examples-vanilla/src/pages/realEstatePage.ts`
 *
 * @packageDocumentation
 */

/**
 * What the real-estate routes say before the listing stream reports a length.
 *
 * @remarks
 * This route has no worker, so the module's default — which names a worker spin-up — would describe
 * something that is not happening.
 */
export const REAL_ESTATE_BOOT_IDLE_CAPTION = 'Booting the real-estate engine…';

/**
 * The plural record noun the real-estate caption interpolates.
 *
 * @remarks
 * `listings`, not `records` or `homes`. It appears in the streaming and indexing states, so a
 * vertical passing a different word would diverge in copy a user reads, in a state that lasts
 * seconds and is easy to miss in review.
 */
export const REAL_ESTATE_RECORD_NOUN = 'listings';
