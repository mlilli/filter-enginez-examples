/**
 * `real-estate-domain/panelCopy` — what every app's real-estate panel says where the apps used to
 * word it themselves.
 *
 * @remarks
 * Read by all six panels, so the location tree scrolls at the same height with the same accessible
 * name, the listed-date presets form the same named group, the school-district list scrolls at the
 * same height, and the description search asks for the same thing everywhere.
 * `tests/tooling/realEstatePanelCopyParity.test.ts` keeps the literals from coming back.
 *
 * @packageDocumentation
 */

/** The location tree's accessible group name and the height it scrolls within. */
export const REAL_ESTATE_LOCATION_TREE = {
	/** The tree's `role="group"` accessible name. */
	groupLabel: 'Location',
	/** The tree's maximum height before it scrolls. */
	maxHeight: '14rem',
} as const;

/** The school-district checkbox list's maximum height before it scrolls. */
export const REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT = '220px';

/** The listed-date presets' heading, which also names their `role="group"`. */
export const REAL_ESTATE_LISTED_DATE_LABEL = 'Listed within';

/** The description search field's copy. */
export const REAL_ESTATE_DESCRIPTION_SEARCH = {
	/** The field's accessible name. */
	ariaLabel: 'Search listing descriptions',
	/** The field's placeholder. */
	placeholder: 'waterfront, remodeled, cul-de-sac…',
} as const;
