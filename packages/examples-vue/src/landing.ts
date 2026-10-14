/**
 * Landing-page dataset cards for the Vue vertical.
 *
 * @remarks
 * The copy and the roster come from `@filter-enginez/examples-shared/landing`, which derives the
 * cards from the routes the vertical registry says this app serves. This file is the thin per-app
 * binding that names the vertical.
 *
 * **Why the roster is derived, not hand-listed:** a hand-listed roster can silently omit a route that
 * works but is then reachable only by typing the URL. Deriving from the same array the comparison page reads
 * makes that class of gap structurally impossible.
 *
 * @packageDocumentation
 */

import { type DatasetCard, landingCards } from '@filter-enginez/examples-shared/landing';

export type { DatasetCard };

/** The dataset cards, in display order. */
export const landingDatasets: readonly DatasetCard[] = landingCards('vue');
