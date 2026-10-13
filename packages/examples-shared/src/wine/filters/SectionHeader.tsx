/**
 * `<SectionHeader />` — labelled header for one filter section.
 *
 * @remarks
 * App-local chrome (not a react-ui control) — it's wine-panel-specific section framing, in its own
 * module so each section container can import it.
 *
 * All styling — mono, uppercase, the cyan left rule, the spacing — comes from
 * `fe-filter-section-label` in `@filter-enginez/ui-styles`, shared with every framework and every
 * dataset, so wine, books and real-estate sections share the same accent border.
 *
 * @packageDocumentation
 */

/**
 * Props for `<SectionHeader />`.
 */
export interface SectionHeaderProps {
	/** The section label, e.g. `Color` / `Price (USD)`. */
	readonly label: string;
	/**
	 * Optional qualifier rendered on its OWN line beneath the label.
	 *
	 * @remarks
	 * A separate prop rather than a newline in `label`, because the caller passes a plain string and
	 * `{'a\nb'}` collapses to one line in HTML. Keeping it structural also means the qualifier can be
	 * styled or hidden independently — "(expression mode)" is a mode annotation, not part of the
	 * facet's name.
	 */
	readonly note?: string;
}

/**
 * Section header — cyan border-left as the data-affordance accent.
 */
export const SectionHeader = ({ label, note }: SectionHeaderProps): React.ReactElement => {
	return (
		<h3 className="fe-filter-section-label">
			{label}
			{note !== undefined && (
				<>
					<br />
					<span className="fe-filter-section-label__note">{note}</span>
				</>
			)}
		</h3>
	);
};
