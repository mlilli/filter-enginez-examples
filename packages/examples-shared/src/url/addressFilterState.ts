/**
 * `loadFilterStateFromAddress` — apply the address's `?f=` filter state to a booted engine before its
 * page first renders.
 *
 * @remarks
 * Every app opens a shared link on the filtered state. Vue, SvelteKit, Angular and the framework-free
 * app load `?f=` into the engine between its boot and its first render; the React apps used to leave it
 * to `<FilterEngineUrlSync>`, whose effect runs after the first commit, so a filtered link first painted
 * the unfiltered count and then counted down to the filtered one — a wrong number on screen. The React
 * boots call this instead, at the same point the other apps hydrate. `<FilterEngineUrlSync>` still
 * follows the address afterward; loading the same state again changes nothing.
 *
 * A link that does not decode, or names a state the engine refuses, is ignored: the page opens on the
 * engine's current state, as every app does with a malformed link.
 *
 * Its own React-free subpath (`./address-filter-state`): the React apps import it with the dataset's code,
 * off their first screen's startup bundle, which the `./url` barrel and its buttons would grow.
 *
 * @packageDocumentation
 */

import { createLinkSerializer } from './linkSerializer.js';
import { URL_STATE_PARAM } from './urlStateFollower.js';

/** The engine side this needs: the one write a filter state takes. */
export interface FilterStateTarget {
	loadConfig(config: ReturnType<ReturnType<typeof createLinkSerializer>['decode']>): void;
}

/**
 * Load the address's filter state into `engine`, if it carries one that decodes and loads.
 *
 * @param engine - The booted engine (its sync core, or a facade that forwards the write).
 * @param search - The address's query; the current page's by default.
 * @returns Whether a state was loaded.
 */
export function loadFilterStateFromAddress(engine: FilterStateTarget, search: string = globalThis.location.search): boolean {
	const serialized = new URLSearchParams(search).get(URL_STATE_PARAM);

	if (serialized === null || serialized === '') {
		return false;
	}
	try {
		// `decode` reads the format from the link's own tag, whatever the format toggle says.
		engine.loadConfig(createLinkSerializer('human-readable').decode(serialized));

		return true;
	} catch {
		return false;
	}
}
