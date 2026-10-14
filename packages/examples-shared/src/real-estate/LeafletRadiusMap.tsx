/**
 * `LeafletRadiusMap` — React's wrapper over the framework-neutral radius-map controller.
 *
 * @remarks
 * Presentational and prop-driven: the parent owns `center` + `radiusKm`, and a marker drag flows back
 * out through `onCenterChange`. Everything the map actually DOES — tile layer, cyan circle, draggable
 * `divIcon` marker, the recenter-only-when-off-screen rule, the refit-on-radius-change rule — lives in
 * `@filter-enginez/examples-shared/real-estate-map`, so the five other verticals render the same map
 * from the same code rather than each reimplementing it.
 *
 * ### Why a ref + effect is safe here
 *
 * A naive `L.map()` effect throws "Map container is already initialized" and crashes on view
 * operations issued after `remove()` — React 19 StrictMode double-invokes effects, and the filter
 * drawer's `keepMounted` offscreen remount does it again for real.
 *
 * The controller answers both directly: it destroys any controller already bound to the container
 * before creating a map, and every method no-ops once destroyed. See its module docs. The map rules
 * are controller methods rather than React `useEffect` bodies, so a Svelte action or an Angular
 * directive gets them for free.
 *
 * ### Leaflet loads when the map mounts
 *
 * The controller, and Leaflet with it, is a dynamic `import()` inside the create-once effect rather
 * than a static import, so Leaflet (about 150 kB, plus its stylesheet) is its own chunk and stays out of
 * every bundle that merely contains this component — the real-estate route's, in both React apps. The
 * region box below renders at its final size from the first frame, so the map fills a box that is
 * already there instead of pushing the panel around when it arrives. That is also why the geometry
 * constant comes from `./map/radiusMapGeometry.js` and not the `./map` barrel: a static import of the
 * barrel would pull the controller back in and turn the `import()` into a no-op.
 *
 * Arriving late is safe for the same reasons the StrictMode remount is: the effect's cleanup marks
 * the mount as gone, a controller that resolves after that is never created, and the sync effects
 * below find no controller until one exists. The controller reads the latest `center` and radius when
 * it IS created, so a change made while Leaflet was loading is not lost.
 *
 * The map is a progressive enhancement, never the only way to drive the geo filter: the section
 * hosting it pairs it with a keyboard-operable metro dropdown and radius slider, and announces the
 * active center and radius textually.
 *
 * Dual-accent contract: the circle and center marker represent the DATA being filtered, so both use
 * the cyan `--accent` token — never phosphor, which is reserved for engine activity.
 *
 * @packageDocumentation
 */

import type { GeoCoords } from '@filter-enginez/core';

import { useEffect, useEffectEvent, useRef } from 'react';

import type { RadiusMapController } from './map/index.js';

import { METERS_PER_KM } from './map/radiusMapGeometry.js';

/** Props for {@link LeafletRadiusMap}. */
export interface LeafletRadiusMapProps {
	/** Accessible name for the map region. Defaults to a generic radius-map description. */
	readonly ariaLabel?: string;
	/** Center of the radius circle and the draggable marker. */
	readonly center: GeoCoords;
	/** Called once per completed marker drag with the marker's new coordinates. */
	readonly onCenterChange: (next: GeoCoords) => void;
	/** Radius of the highlight circle, in kilometers. */
	readonly radiusKm: number;
}

/**
 * An OpenStreetMap raster map showing a cyan radius circle around a draggable center marker.
 *
 * @param props - See {@link LeafletRadiusMapProps}.
 * @returns The map region.
 */
export const LeafletRadiusMap = (props: LeafletRadiusMapProps): React.ReactElement => {
	const { ariaLabel, center, onCenterChange, radiusKm } = props;
	const radiusMeters = radiusKm * METERS_PER_KM;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const controllerRef = useRef<RadiusMapController | null>(null);

	// Latest props through Effect Events so the create-once effect never has to name them as
	// dependencies. Taking `center` or `onCenterChange` as a dependency there would tear the map down
	// and rebuild it on every drag, losing the user's zoom mid-interaction. An Effect Event always sees
	// the props of the latest committed render, without being a dependency itself.
	const readInitialView = useEffectEvent((): { readonly center: GeoCoords; readonly radiusMeters: number } => ({
		center,
		radiusMeters,
	}));
	const reportCenterChange = useEffectEvent((next: GeoCoords): void => {
		onCenterChange(next);
	});

	// Create once per mount. StrictMode runs this twice (mount → cleanup → mount); the cleanup's
	// `destroy()` plus the controller's own per-container guard make the second run land on a clean
	// element rather than on Leaflet's "already initialized". With Leaflet loading asynchronously the
	// first run's import usually resolves after its cleanup, so it creates nothing at all.
	useEffect(() => {
		const element = containerRef.current;

		/* v8 ignore next 3 -- the ref is always attached by the time effects run; a null here would
		   mean React handed us an unmounted tree. */
		if (element === null) {
			return undefined;
		}

		let isUnmounted = false;
		let controller: RadiusMapController | null = null;

		void import('./map/index.js').then(({ createRadiusMapController }) => {
			if (isUnmounted) {
				return;
			}

			// Read now rather than when the effect ran: the props may have moved while Leaflet loaded.
			const initialView = readInitialView();

			controller = createRadiusMapController(element, {
				center: initialView.center,
				// Stable by construction — calls the Effect Event, so a changing parent callback never
				// re-creates the map, and a drag always reports to the latest one.
				onCenterChange: (next) => {
					reportCenterChange(next);
				},
				radiusMeters: initialView.radiusMeters,
				// Read at creation: Leaflet's animation options are init-only.
				shouldReduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
			});
			controllerRef.current = controller;
		});

		return () => {
			isUnmounted = true;
			controller?.destroy();
			controllerRef.current = null;
		};
	}, []);

	// Sync effects. Both no-op after teardown — `controllerRef` is nulled by the cleanup above, and the
	// controller itself ignores calls once destroyed, which is the race a naive `L.map()` effect
	// crashes on.
	useEffect(() => {
		controllerRef.current?.setCenter(center);
	}, [center]);

	useEffect(() => {
		controllerRef.current?.setRadius(radiusMeters);
	}, [radiusMeters]);

	return (
		<div
			role="region"
			aria-label={ariaLabel ?? 'Map of the search area — drag the cyan marker to move the center'}
			style={{
				border: '1px solid var(--gray-4)',
				borderRadius: '8px',
				height: 'clamp(220px, 40vh, 360px)',
				overflow: 'hidden',
				width: '100%',
			}}
		>
			<div ref={containerRef} style={{ height: '100%', width: '100%' }} />
		</div>
	);
};
