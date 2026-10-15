/**
 * Tests for the header's React-free strings and URLs.
 *
 * @remarks
 * The case that matters most is the subtitle split: the e2e suites wait on the WHOLE subtitle text as
 * their boot signal, so the three parts must reassemble into exactly `verticalSubtitle`'s string for
 * every app and every tier, link or no link.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { type EngineTier, SITE, VERTICALS, verticalSubtitle } from '../verticals/verticals.js';
import {
	ALL_DEMOS_LABEL,
	APP_HUB_PATH,
	appHeaderLinks,
	appHeaderSubtitle,
	appHubLabel,
	HEADER_PAGE_LABELS,
	SITE_HOME_LABEL,
} from './core.js';

/** Stand-in for `window.location` on a developer's machine. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5192' };

/** Stand-in for a deployed app. */
const PROD_LOCATION = { hostname: 'svelte.filterenginez.com', origin: 'https://svelte.filterenginez.com' };

/** Every engine tier, plus none. */
const TIERS: readonly (EngineTier | undefined)[] = [undefined, 'bare-core', 'config', 'server', 'signals', 'worker'];

describe('appHeaderSubtitle', () => {
	it('reassembles into the registry subtitle for every app and tier', () => {
		for (const { id } of VERTICALS) {
			for (const tier of TIERS) {
				const { hub, lead, text, trail } = appHeaderSubtitle('Wine', id, tier);

				expect(`${lead}${hub?.text ?? ''}${trail}`).toBe(verticalSubtitle('Wine', id, tier));
				expect(text).toBe(verticalSubtitle('Wine', id, tier));
			}
		}
	});

	it('puts the app name alone in the linked part, and the tier after it', () => {
		expect(appHeaderSubtitle('Wine', 'sveltekit', 'server')).toEqual({
			hub: { href: APP_HUB_PATH, label: 'SvelteKit dataset hub', text: 'SvelteKit' },
			lead: 'Wine · ',
			text: 'Wine · SvelteKit (server)',
			trail: ' (server)',
		});
		expect(appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'vue').trail).toBe('');
	});

	it('names the page alone outside the six apps', () => {
		expect(appHeaderSubtitle(HEADER_PAGE_LABELS.docs)).toEqual({ hub: null, lead: 'Docs', text: 'Docs', trail: '' });
	});
});

describe('appHubLabel', () => {
	it('starts with the visible link text, so speech input can name it', () => {
		for (const { id, name } of VERTICALS) {
			expect(appHubLabel(id).startsWith(name)).toBe(true);
		}

		expect(appHubLabel('react-rtk')).toBe('React RTK dataset hub');
	});
});

describe('appHeaderLinks', () => {
	it('links home and to the demo list on the deployed apex', () => {
		// Literals: these are the addresses every deployed header publishes.
		expect(appHeaderLinks(PROD_LOCATION)).toEqual({
			allDemosHref: 'https://filterenginez.com/#demos',
			homeHref: 'https://filterenginez.com/',
		});
	});

	it('links to the local site server in development', () => {
		expect(appHeaderLinks(DEV_LOCATION)).toEqual({
			allDemosHref: `${SITE.devOrigin}/#demos`,
			homeHref: `${SITE.devOrigin}/`,
		});
		expect(appHeaderLinks(DEV_LOCATION, 'production').homeHref).toBe('https://filterenginez.com/');
	});
});

describe('labels', () => {
	it('keeps the visible and accessible names the specs and the guard look for', () => {
		expect(ALL_DEMOS_LABEL).toBe('All demos');
		expect(SITE_HOME_LABEL).toBe('Filter EngineZ home');
		expect(APP_HUB_PATH).toBe('/');
	});
});
