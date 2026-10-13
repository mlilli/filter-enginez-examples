/**
 * Landing-page dataset cards for the SvelteKit vertical.
 *
 * @remarks
 * Kept as a plain module (imported by `+page.svelte`) rather than inline in the component `<script>`,
 * both for cleanliness and to keep the data out of the Svelte component parser. The roster and copy
 * come from `@filter-enginez/examples-shared/landing`, which derives the cards from the routes the
 * app registry says this app serves — so this app's two server-filtered demos appear because
 * `routes` lists them, not because someone remembered.
 *
 * The wine card's worker-tier sentence is shared too: all six apps boot wine on a worker, so it is
 * not SvelteKit-specific.
 *
 * @packageDocumentation
 */

import { type DatasetCard, landingCards } from '@filter-enginez/examples-shared/landing';

export type { DatasetCard };

/** The dataset cards, in display order. */
export const landingDatasets: readonly DatasetCard[] = landingCards('sveltekit');
