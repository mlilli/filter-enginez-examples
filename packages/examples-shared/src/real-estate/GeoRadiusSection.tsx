/**
 * `GeoRadiusSection` — the engine-wired "within N km of a point" filter section for the
 * real-estate panel.
 *
 * @remarks
 * Composes the {@link LeafletRadiusMap} with a metro-area dropdown, a "Near me" geolocation
 * button, and a radius slider — all TWO-WAY SYNCED: whichever control changes the center or
 * radius, every control (and the map) reflects it. Rule commits follow the books/wine section
 * pattern exactly: read via `useRule`, paint the optimistic local state, then run the engine call
 * through `commitFilterMutation` (optimistic paint → loader flip → engine call, each on its own
 * frame).
 *
 * OFF is modeled as rule absence: the "Filter by distance" checkbox adds the `geo` rule at the
 * current center + radius when enabled and `removeRule`s it when disabled (empty = no constraint).
 * While off, the map + controls are unmounted — no tile fetches for a filter that isn't engaged.
 *
 * Accessibility: the map is a progressive enhancement. The dropdown, slider, checkbox, and button
 * are fully keyboard-operable and labeled, and the active center/radius is announced textually via
 * a polite live region — never by the map alone. All result-affecting controls use the cyan
 * `--accent` token (data identity), never phosphor.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { geo, type GeoCoords, type GeoProximityRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { useCallback, useId, useState } from 'react';

import { commitFilterMutation } from '../scheduling/index.js';
import { markUserAction } from './engineBusy.js';
import { LeafletRadiusMap } from './LeafletRadiusMap.js';
import { extractListingCoords } from './real-estate-domain/extractors.js';
import { findMetroLabel, listingMetroCenters, type MetroCenterOption } from './real-estate-domain/metroCenters.js';
import { kmToMiles, milesToKm } from './real-estate-domain/units.js';

/** Rule id + registry key for the geo-proximity rule. */
const GEO_RULE_ID = 'geo-proximity';

/** Default center when the filter is first enabled — San Francisco. */
const DEFAULT_CENTER: GeoCoords = { lat: 37.7749, lng: -122.4194 };

/** Default radius (km) when the filter is first enabled — a 15-mile commute radius. */
const DEFAULT_RADIUS_KM = milesToKm(15);

/** Radius slider bounds, in miles (US real-estate distances read in miles; the engine works in km). */
const RADIUS_MIN_MILES = 1;
const RADIUS_MAX_MILES = 60;

/** Decimal places when describing a hand-dragged (non-metro) center textually. */
const COORD_DISPLAY_DECIMALS = 4;

/** Geolocation lookup limits — accept a fix cached up to 1 min; give up after 10 s. */
const GEOLOCATION_MAX_AGE_MS = 60000;
const GEOLOCATION_TIMEOUT_MS = 10000;

/** Metro options derived once from the bundled default-tier corpus. */
/* The derivation lives in `real-estate-domain/metroCenters`, where the results header can also reach
 * it — the Distance chip names the center rather than printing a radius with no anchor. One place,
 * two consumers. */
const metroCenterOptions: readonly MetroCenterOption[] = listingMetroCenters;

/**
 * The real-estate "Distance" filter section: enable checkbox → metro dropdown + "Near me" button +
 * Leaflet radius map + radius slider, committing a `geo(extractListingCoords, ...)` rule under
 * {@link GEO_RULE_ID}.
 */
export const GeoRadiusSection = (): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const rule = useRule(GEO_RULE_ID) as GeoProximityRule | undefined;
	const engineCenter = rule?.config.center;
	const engineRadiusKm = rule?.config.radiusKm;
	const isRuleActive = rule !== undefined;

	const [isEnabled, setIsEnabled] = useState(isRuleActive);
	const [center, setCenter] = useState<GeoCoords>(engineCenter ?? DEFAULT_CENTER);
	const [radiusKm, setRadiusKm] = useState(engineRadiusKm ?? DEFAULT_RADIUS_KM);

	// Radius value while the slider thumb is mid-drag — painted locally per tick, committed to the
	// engine ONCE on release (pointer up / key up / blur), mirroring the RangeSlider drag pattern.
	const [draftRadiusKm, setDraftRadiusKm] = useState<number | null>(null);

	const [isLocating, setIsLocating] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);

	const metroSelectId = useId();
	const radiusSliderId = useId();

	// The engine-side values last adopted below, so an external change can be told from a re-render.
	const [lastSeenEngineState, setLastSeenEngineState] = useState({ engineCenter, engineRadiusKm, isRuleActive });

	// Re-sync from the engine on external change (clear-all etc.); equal values are no-ops. Adjusted
	// during render rather than in an effect, so the controls and the map never paint the stale
	// center or radius first. `Object.is` is the comparison an effect's dependency array would make.
	if (
		!Object.is(engineCenter, lastSeenEngineState.engineCenter)
		|| !Object.is(engineRadiusKm, lastSeenEngineState.engineRadiusKm)
		|| isRuleActive !== lastSeenEngineState.isRuleActive
	) {
		setLastSeenEngineState({ engineCenter, engineRadiusKm, isRuleActive });
		setIsEnabled(isRuleActive);
		if (engineCenter !== undefined && !isSameCoords(center, engineCenter)) {
			setCenter(engineCenter);
		}
		if (engineRadiusKm !== undefined && radiusKm !== engineRadiusKm) {
			setRadiusKm(engineRadiusKm);
		}
	}

	/** Commit a fresh geo rule: paint center + radius optimistically, engine call off-frame. */
	const commitRule = useCallback((nextCenter: GeoCoords, nextRadiusKm: number): void => {
		commitFilterMutation({
			callEngine: () => engine.core.addRule(
				GEO_RULE_ID,
				geo(extractListingCoords, { center: nextCenter, radiusKm: nextRadiusKm }),
			),
			markBusy: markUserAction,
			paintOptimisticUi: () => {
				setCenter(nextCenter);
				setRadiusKm(nextRadiusKm);
			},
		});
	}, [engine]);

	const handleEnabledToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
		// Capture now — `commitFilterMutation` defers `callEngine` past this event's lifetime.
		const shouldEnable = event.target.checked;

		if (shouldEnable) {
			commitFilterMutation({
				callEngine: () => engine.core.addRule(GEO_RULE_ID, geo(extractListingCoords, { center, radiusKm })),
				markBusy: markUserAction,
				paintOptimisticUi: () => setIsEnabled(true),
			});

			return;
		}
		commitFilterMutation({
			callEngine: () => engine.core.removeRule(GEO_RULE_ID),
			markBusy: markUserAction,
			paintOptimisticUi: () => setIsEnabled(false),
		});
	}, [center, engine, radiusKm]);

	const handleMetroChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>): void => {
		const option = metroCenterOptions.find((metro) => metro.label === event.target.value);

		// Re-selecting the "Custom location" placeholder has nothing to recenter to.
		if (option === undefined) {
			return;
		}
		commitRule(option.center, radiusKm);
	}, [commitRule, radiusKm]);

	const handleNearMe = useCallback((): void => {
		// Feature-detect in the guard shape eslint-plugin-compat recognizes (usage nested inside a
		// positive `'geolocation' in navigator` check) — the DOM lib types declare geolocation
		// non-optional, but locked-down browsers can still lack it at runtime.
		if ('geolocation' in navigator) {
			setIsLocating(true);
			setLocationError(null);
			navigator.geolocation.getCurrentPosition(
				(position) => {
					setIsLocating(false);
					commitRule({ lat: position.coords.latitude, lng: position.coords.longitude }, radiusKm);
				},
				(error) => {
					setIsLocating(false);
					setLocationError(
						error.code === error.PERMISSION_DENIED
							? 'Location permission was denied.'
							: 'Your location could not be determined.',
					);
				},
				{ maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
			);

			return;
		}
		setLocationError('Location is not available in this browser.');
	}, [commitRule, radiusKm]);

	const handleMapCenterChange = useCallback((next: GeoCoords): void => {
		commitRule(next, radiusKm);
	}, [commitRule, radiusKm]);

	const handleRadiusInput = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
		setDraftRadiusKm(milesToKm(Number(event.target.value)));
	}, []);

	const handleRadiusCommit = useCallback((): void => {
		setDraftRadiusKm(null);
		if (draftRadiusKm === null || draftRadiusKm === radiusKm) {
			return;
		}
		commitRule(center, draftRadiusKm);
	}, [center, commitRule, draftRadiusKm, radiusKm]);

	const shownRadiusKm = draftRadiusKm ?? radiusKm;
	const shownRadiusMiles = Math.round(kmToMiles(shownRadiusKm));
	const selectedMetroLabel =
		findMetroLabel(metroCenterOptions, center) ?? '';
	const centerDescription = selectedMetroLabel !== ''
		? selectedMetroLabel
		: `${center.lat.toFixed(COORD_DISPLAY_DECIMALS)}, ${center.lng.toFixed(COORD_DISPLAY_DECIMALS)}`;

	return (
		<section>
			<h3 className="fe-filter-section-label">Distance</h3>
			<label
				className="flex items-center gap-2 text-sm cursor-pointer"
				style={{ color: 'var(--gray-10)', minHeight: '44px' }}
			>
				<input
					type="checkbox"
					checked={isEnabled}
					onChange={handleEnabledToggle}
					style={{ accentColor: 'var(--accent)', height: '18px', width: '18px' }}
				/>
				<span>Filter by distance</span>
			</label>
			{isEnabled ? (
				<div className="flex flex-col gap-3">
					<div>
						<label
							htmlFor={metroSelectId}
							className="block text-xs mb-1"
							style={{ color: 'var(--gray-9)' }}
						>
							Metro area
						</label>
						<div className="fe-chip-toggle">
							<select
								id={metroSelectId}
								value={selectedMetroLabel}
								onChange={handleMetroChange}
								style={{
									backgroundColor: 'var(--gray-1)',
									border: '1px solid var(--gray-4)',
									borderRadius: '6px',
									color: 'var(--gray-10)',
									flex: '1 1 10rem',
									minHeight: '44px',
									minWidth: '0',
									padding: '0 10px',
								}}
							>
								<option value="">Custom location</option>
								{metroCenterOptions.map((metro) => (
									<option key={metro.label} value={metro.label}>
										{metro.label}
									</option>
								))}
							</select>
							<button
								type="button"
								onClick={handleNearMe}
								disabled={isLocating}
								aria-label="Center the search radius on my current location"
								style={{
									background: 'transparent',
									border: '1px solid var(--accent-dim)',
									borderRadius: '6px',
									color: 'var(--accent)',
									cursor: isLocating ? 'wait' : 'pointer',
									minHeight: '44px',
									padding: '0 14px',
								}}
							>
								{isLocating ? 'Locating…' : 'Near me'}
							</button>
						</div>
					</div>
					<LeafletRadiusMap
						center={center}
						radiusKm={radiusKm}
						onCenterChange={handleMapCenterChange}
						ariaLabel="Map of the listing search area — drag the cyan marker to move the center"
					/>
					<div>
						<label
							htmlFor={radiusSliderId}
							className="flex items-center justify-between text-xs mb-1"
							style={{ color: 'var(--gray-9)' }}
						>
							<span>Radius</span>
							<span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
								{shownRadiusMiles} mi
							</span>
						</label>
						<input
							id={radiusSliderId}
							type="range"
							min={RADIUS_MIN_MILES}
							max={RADIUS_MAX_MILES}
							step={1}
							value={shownRadiusMiles}
							onChange={handleRadiusInput}
							onPointerUp={handleRadiusCommit}
							onKeyUp={handleRadiusCommit}
							onBlur={handleRadiusCommit}
							style={{
								accentColor: 'var(--accent)',
								display: 'block',
								height: '44px',
								width: '100%',
							}}
						/>
					</div>
					<p
						aria-live="polite"
						className="text-xs"
						style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)' }}
					>
						{`Showing listings within ${Math.round(kmToMiles(radiusKm))} miles of ${centerDescription}`}
					</p>
					{locationError === null ? null : (
						<p role="alert" className="text-xs" style={{ color: 'var(--gray-10)' }}>
							{locationError}
						</p>
					)}
				</div>
			) : null}
		</section>
	);
};

/**
 * Value equality for two coordinates. Centers flow around as the same object (rule config ↔ local
 * state ↔ metro option), so strict component equality is sufficient — no epsilon needed.
 *
 * @internal
 */
function isSameCoords(a: GeoCoords, b: GeoCoords): boolean {
	return a.lat === b.lat && a.lng === b.lng;
}
