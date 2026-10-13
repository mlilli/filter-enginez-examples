/**
 * `formatters` — how the real-estate dataset renders its own values, for every vertical.
 *
 * @remarks
 * Two helpers, and both are here for the same reason: every surface that displays a listing needs
 * them, and a display convention duplicated per surface is one that eventually disagrees with itself.
 * The user sees `$1,250,000` on the card and `$1.25M` on the chip, and nobody touched either file.
 *
 * `formatListingPrice` is used wherever a listing price renders, in every vertical and in the rule
 * summarizer — one `Intl.NumberFormat('en-US', { currency: 'USD', maximumFractionDigits: 0, style: 'currency' })`
 * rather than a copy per surface. `humanizeVocabularyValue` is shared the same way.
 *
 * A FUNCTION rather than an exported formatter instance, deliberately: the options are the decision
 * worth centralizing, and handing out the instance would let a caller reach past them (`.formatToParts`,
 * `.resolvedOptions`) and quietly grow a second convention on top of the first.
 *
 * The instance itself is still constructed once at module scope. `Intl.NumberFormat` construction is
 * the expensive half — it resolves locale data — and a listing grid formats a price per card per
 * render.
 *
 * @packageDocumentation
 */

/**
 * The whole-dollar USD formatter. Cents on a house price are noise, and they cost horizontal space
 * the card's fixed rhythm does not have.
 */
const listingPriceFormatter = new Intl.NumberFormat('en-US', {
	currency: 'USD',
	maximumFractionDigits: 0,
	style: 'currency',
});

/**
 * Render a listing price as whole-dollar USD.
 *
 * @param value - The price in dollars.
 * @returns The formatted price, e.g. `$1,250,000`.
 */
export function formatListingPrice(value: number): string {
	return listingPriceFormatter.format(value);
}

/**
 * Render a kebab-cased vocabulary value as spaced words (`single-family` → `single family`).
 *
 * @remarks
 * The dataset's display convention for every corpus vocabulary — property types, statuses, features,
 * and the values a rule summary names. Only the SEPARATOR changes here; `text-transform: capitalize`
 * in `ui-styles` does the casing, so the displayed string stays a faithful view of the stored value
 * rather than a second vocabulary that has to be kept in step.
 *
 * @param value - The raw corpus value.
 * @returns The display string.
 */
export function humanizeVocabularyValue(value: string): string {
	return value.replace(/-/gu, ' ');
}
