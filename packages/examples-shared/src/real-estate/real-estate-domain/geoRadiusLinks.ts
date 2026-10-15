/**
 * `geoRadiusLinks` — how the real-estate distance rule reads in a `?f=` link, including a link that
 * carries it over a function field.
 *
 * @remarks
 * Every real-estate app commits the distance filter as the same `GeoProximityRule` over the listing's
 * `coords` field (`./geoRadiusRule.ts` says why). A link may instead carry that rule over a FUNCTION
 * field, an extractor that turned `coordinates: { lat, lon }` into the `{ lat, lng }` the rule reads. A
 * function field travels as the placeholder `"<function>"`, which no app can turn back into a function:
 * decoded as is, the rule reads the whole listing as its point, finds no `lat` / `lng` there, and matches
 * no listing. So every app decodes `?f=` through {@link withNormalizedGeoRadiusRule}, which gives that
 * rule its field back.
 *
 * The rewrite is keyed on the rule ID, because the id is the one thing such a link says reliably: its
 * field is a placeholder, but its id is {@link GEO_RADIUS_RULE_ID} and its config, `{ center, radiusKm }`,
 * is intact. Only a `GeoProximityRule` under that id whose field is the placeholder is rewritten, and only
 * its field changes, so it becomes exactly the rule a panel commits for the same center and radius. Every
 * other rule, and a geo rule that already names a field, passes through untouched.
 *
 * The real-estate location rule (`./locationLinks.ts`) and the wine origin rule
 * (`../../wine/wine-domain/originLinks.ts`) have the same arrangement.
 *
 * Its own module, imported by `src/url/linkSerializer.ts` — the serializer every app's URL layer builds
 * on every route — so that it pulls in nothing but types.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, RuleId, SerializedRule } from '@filter-enginez/core';
import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

/** The distance facet's rule id. */
export const GEO_RADIUS_RULE_ID: RuleId = 'geo-proximity';

/**
 * The record field the distance rule tests: each listing's `{ lat, lng }` point.
 *
 * @remarks
 * `Listing.coords` is the same point as `Listing.coordinates`, in the shape `GeoProximityRule` and the
 * engine's R-tree spatial index read, so the rule can name its field by string.
 */
export const GEO_RADIUS_FIELD = 'coords';

/** The serialized `type` of the distance rule. */
const GEO_PROXIMITY_TYPE = 'GeoProximityRule';

/** What `exportConfig` writes in place of a function field. */
const FUNCTION_FIELD_PLACEHOLDER = '<function>';

/**
 * Give one decoded rule its field back, when it is a distance rule that travelled over a function field.
 *
 * @remarks
 * The config is not checked: only the field changes, so a malformed config reaches the engine's own
 * deserialization exactly as the link carried it.
 *
 * @param rule - The serialized rule under the distance id.
 * @returns The rule to load.
 */
function normalizeSerializedGeoRadiusRule(rule: SerializedRule): SerializedRule {
	if (rule.type !== GEO_PROXIMITY_TYPE || rule.field !== FUNCTION_FIELD_PLACEHOLDER) {
		return rule;
	}

	return { ...rule, field: GEO_RADIUS_FIELD };
}

/**
 * Read a decoded filter state's distance rule in the form every app commits.
 *
 * @remarks
 * See the module docblock. Rules with any other id are returned untouched, so this is safe to apply to
 * every dataset's links; a config with no distance rule is returned as the same object.
 *
 * @param config - A config decoded from `?f=`.
 * @returns The config, its distance rule (if any) normalized.
 */
export function normalizeGeoRadiusRule(config: FilterEngineConfig): FilterEngineConfig {
	if (!config.rules.some((entry) => entry.id === GEO_RADIUS_RULE_ID)) {
		return config;
	}

	return {
		...config,
		rules: config.rules.map((entry) =>
			entry.id === GEO_RADIUS_RULE_ID ? { id: entry.id, rule: normalizeSerializedGeoRadiusRule(entry.rule) } : entry,
		),
	};
}

/**
 * A `?f=` serializer whose `decode` also normalizes the distance rule ({@link normalizeGeoRadiusRule}).
 *
 * @remarks
 * Applied by `createLinkSerializer`, which every app decodes links with — on first load, when the format
 * toggle re-encodes the address bar, and on the server routes. `encode` is the serializer's own.
 *
 * @param serializer - The serializer to wrap.
 * @returns The wrapped serializer.
 */
export function withNormalizedGeoRadiusRule(serializer: EngineStateSerializer): EngineStateSerializer {
	return {
		decode: (serialized) => normalizeGeoRadiusRule(serializer.decode(serialized)),
		encode: (config) => serializer.encode(config),
		name: serializer.name,
	};
}
