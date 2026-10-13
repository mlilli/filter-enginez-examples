/**
 * `<CheckboxControl />` — the shared checkbox row for the books single-toggle sections.
 *
 * @remarks
 * Pure markup consumed by `<BooleanSection />` + `<ExistsSection />` (in `BookFilterSections.tsx`)
 * and the curated `<FeaturedSection />` (in `BookCuratedFilterSections.tsx`). The ≥44px touch
 * target, accent tick, disabled/subdued treatment, and label live here so every toggle stays
 * pixel-identical and none re-implements the row. Extracted to its own file to keep
 * `BookFilterSections.tsx` under the file-size cap.
 *
 * @packageDocumentation
 */

/**
 * Props for {@link CheckboxControl}.
 */
export interface CheckboxControlProps {
	/** Whether the box is checked. */
	readonly isChecked: boolean;
	/** When `true`, the box is disabled + subdued (turning it on would empty the result set). */
	readonly isDisabled?: boolean;
	/** Checkbox label. */
	readonly label: string;
	/** Change handler — receives the raw change event (read `.target.checked` synchronously). */
	readonly onToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Shared single-checkbox row for the books toggle sections.
 */
export const CheckboxControl = (props: CheckboxControlProps): React.ReactElement => {
	const { isChecked, isDisabled = false, label, onToggle } = props;

	return (
		<label
			className="flex items-center gap-2 text-sm"
			style={{
				color: isDisabled ? 'var(--gray-8)' : 'var(--gray-10)',
				cursor: isDisabled ? 'not-allowed' : 'pointer',
				minHeight: '44px',
			}}
			title={isDisabled ? 'No matches given your other filters' : undefined}
		>
			<input
				type="checkbox"
				checked={isChecked}
				disabled={isDisabled}
				onChange={onToggle}
				style={{ accentColor: 'var(--accent)', height: '18px', width: '18px' }}
			/>
			{label}
		</label>
	);
};
