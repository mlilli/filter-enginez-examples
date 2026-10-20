/**
 * The static sites' Worker entry point: its module shape, and that it bundles nothing but the
 * well-known answer.
 *
 * @remarks
 * The export list is pinned for the reason `cloudflareWorker.test.ts` gives. The import list is pinned
 * because the documentation site and the Vue app ship this Worker: an import of the API handler would
 * bundle the engine into a Worker that never filters anything.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as entryModule from './staticAssetsWorker.js';
import { handleStaticAssetsRequest } from './wellKnown.js';

describe('staticAssetsWorker (the static sites’ Worker entry point)', () => {
	it('exports nothing but the default handler', () => {
		expect(Object.keys(entryModule)).toEqual(['default']);
	});

	it('routes fetch to the well-known handler', () => {
		expect(entryModule.default.fetch).toBe(handleStaticAssetsRequest);
	});

	it('imports only the well-known module, which imports no runtime code', () => {
		const importsOf = (name: string): readonly string[] =>
			[...readFileSync(new URL(name, import.meta.url), 'utf8').matchAll(/^import (type )?.*? from '([^']+)';$/gmu)].map(
				([, typeOnly, specifier]) => `${typeOnly ?? ''}${specifier ?? ''}`,
			);

		expect(importsOf('./staticAssetsWorker.ts')).toEqual(['./wellKnown.js']);
		expect(importsOf('./wellKnown.ts')).toEqual(['type ./workerRequestHandler.js']);
	});
});
