/**
 * Landing-page dataset cards for the Angular vertical.
 *
 * @remarks
 * The roster comes from `@filter-enginez/examples-shared/landing`, derived from the routes the
 * vertical registry says this app serves — including `/books-server`, so the server-filtered demo is
 * one click from the landing page like every other route.
 *
 * The cards are derived rather than listed because a hand-kept roster beside the thing it describes
 * drifts: a route added to `app.routes.ts` and the registry but not to the list is reachable only by
 * typing its URL.
 *
 * @packageDocumentation
 */

import { type DatasetCard, landingCards } from '@filter-enginez/examples-shared/landing';

export type { DatasetCard };

/** The dataset cards, in display order. */
export const landingDatasets: readonly DatasetCard[] = landingCards('angular');
