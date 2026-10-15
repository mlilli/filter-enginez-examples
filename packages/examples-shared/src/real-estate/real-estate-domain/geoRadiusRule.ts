/**
 * `geoRadiusRule` — the one rule every real-estate app commits for the distance filter, and how a panel
 * reads its center and radius back.
 *
 * @remarks
 * ## One rule in all six apps: `GeoProximityRule` over `coords`
 *
 * A `?f=` link is how a filter state travels: the address bar holds it, the Copy link button copies it,
 * and each app's Compare button hands it to `/compare`, which links it into all six apps. So the distance
 * filter has to be a rule that survives that trip, and the same rule, with the same serialization,
 * whichever app made it. It is a `GeoProximityRule` over the listing's `coords` field, `{ lat, lng }`,
 * for two reasons:
 *
 * 1. **It round-trips.** It names its field by string. A rule over a function field (an extractor
 *    renaming `coordinates.lon` to `lng`) serializes as the placeholder `"<function>"`, and a link
 *    carrying it decodes into a rule that matches no listing.
 * 2. **The R-tree accelerates it.** The engine keys its spatial index on the rule's field and reads
 *    `{ lat, lng }` through it, so every distance rule shares one tree over `coords`.
 *
 * Links that carry the distance rule over a function field still decode, into this same rule: see
 * `./geoRadiusLinks.ts`. The location rule is built the same way (`./locationRule.ts`).
 *
 * @packageDocumentation
 */

import { type FilterEngine, type FilterRule, geo, type GeoCoords, type GeoProximityRule } from '@filter-enginez/core';

import { GEO_RADIUS_FIELD, GEO_RADIUS_RULE_ID } from './geoRadiusLinks.js';

/** A distance filter's circle: where it is centered and how far it reaches. */
export interface GeoRadius {
	/** The circle's center. */
	readonly center: GeoCoords;
	/** The circle's radius, in kilometers — the unit the engine's rule uses. */
	readonly radiusKm: number;
}

/**
 * The distance rule for a circle.
 *
 * @param radius - The circle.
 * @returns The rule.
 */
export function buildListingGeoRadiusRule(radius: GeoRadius): GeoProximityRule {
	return geo(GEO_RADIUS_FIELD, { center: radius.center, radiusKm: radius.radiusKm });
}

/**
 * Write the distance filter to an engine: the rule for a circle, no rule for none.
 *
 * @remarks
 * Off is the rule's absence rather than a permissive rule, because a `GeoProximityRule` has no neutral
 * configuration: a radius of zero filters to nothing rather than to everything.
 *
 * @param core - The engine to write.
 * @param radius - The circle, or `undefined` to switch the filter off.
 */
export function writeGeoRadius(
	core: Pick<FilterEngine<unknown>, 'addRule' | 'removeRule'>,
	radius: GeoRadius | undefined,
): void {
	if (radius === undefined) {
		core.removeRule(GEO_RADIUS_RULE_ID);

		return;
	}
	core.addRule(GEO_RADIUS_RULE_ID, buildListingGeoRadiusRule(radius));
}

/**
 * Recover the distance filter's circle from the committed rule.
 *
 * @remarks
 * **The inverse of {@link buildListingGeoRadiusRule}**, and what each panel derives its checkbox, center
 * and radius from: the filter is on exactly when this returns a circle. Reads the config structurally, so
 * an absent rule, or a rule of another shape under the distance id, reads as no circle. The center is
 * the rule's own object, not a copy, so a panel that compares centers by identity sees no change after
 * a commit of its own.
 *
 * @param rule - The engine's `geo-proximity` rule, if any.
 * @returns The circle, or `undefined` when there is none.
 */
export function deriveGeoRadius(rule: FilterRule | undefined): GeoRadius | undefined {
	const config = rule?.config as { readonly center?: unknown; readonly radiusKm?: unknown } | null | undefined;
	const center = config?.center;
	const radiusKm = config?.radiusKm;

	return isGeoCoords(center) && typeof radiusKm === 'number' ? { center, radiusKm } : undefined;
}

/**
 * Whether a value is a `{ lat, lng }` point.
 *
 * @param value - Anything.
 * @returns `true` for an object with numeric `lat` and `lng`.
 */
function isGeoCoords(value: unknown): value is GeoCoords {
	const candidate = value as { readonly lat?: unknown; readonly lng?: unknown } | null | undefined;

	return typeof candidate?.lat === 'number' && typeof candidate.lng === 'number';
}
