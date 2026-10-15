/**
 * `linkSerializer` — the one `?f=` serializer every app reads and writes shareable links with.
 *
 * @remarks
 * A filter state travels between the six apps as a `?f=` value: each app's Compare button hands it to
 * `/compare`, which links it into all six. For the same link to mean the same filters in every app,
 * every app has to read it the same way, so none of them builds its serializer by hand.
 * {@link createLinkSerializer} is url-state-router's tagged serializer (a value self-identifies its
 * format, so a link keeps working across a format switch) whose `decode` also reads the wine origin
 * rule, the real-estate location rule and the real-estate distance rule in the form every app commits
 * (`wine/wine-domain/originLinks.ts`, `real-estate/real-estate-domain/locationLinks.ts`,
 * `real-estate/real-estate-domain/geoRadiusLinks.ts`). Every other rule passes through untouched, so it
 * serves every route.
 *
 * React-free, on its own subpath (`@filter-enginez/examples-shared/link-serializer`): every app's URL
 * layer imports it on every route. `tests/tooling/winePanelFacetParity.test.ts` holds the apps to it.
 *
 * @packageDocumentation
 */

import {
	type BuiltInSerializerName,
	createTaggedSerializer,
	type EngineStateSerializer,
} from '@filter-enginez/url-state-router/serializers';

import { withNormalizedGeoRadiusRule } from '../real-estate/real-estate-domain/geoRadiusLinks.js';
import { withNormalizedLocationRule } from '../real-estate/real-estate-domain/locationLinks.js';
import { withNormalizedOriginRule } from '../wine/wine-domain/originLinks.js';

/**
 * The shareable-link serializer for a format.
 *
 * @param format - The format `encode` writes. `decode` reads all three, by their tags.
 * @returns The serializer.
 */
export function createLinkSerializer(format: BuiltInSerializerName): EngineStateSerializer {
	return withNormalizedGeoRadiusRule(withNormalizedLocationRule(withNormalizedOriginRule(createTaggedSerializer(format))));
}
