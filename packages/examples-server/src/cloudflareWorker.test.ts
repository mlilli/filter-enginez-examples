/**
 * The Worker entry point's module shape.
 *
 * @remarks
 * The Workers runtime reads every named export of a Worker's main module as an entry point and
 * refuses to start when one is not a handler ("Incorrect type for map entry …"). Nothing short of
 * starting the runtime notices that — the bundle builds, `wrangler deploy --dry-run` passes, the unit
 * tests of the logic pass — so the export list is pinned here instead.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import * as entryModule from './cloudflareWorker.js';
import { handleWorkerRequest } from './workerRequestHandler.js';

describe('cloudflareWorker (the Worker entry point)', () => {
	it('exports nothing but the default handler', () => {
		expect(Object.keys(entryModule)).toEqual(['default']);
	});

	it('routes fetch to the shared request handler', () => {
		expect(entryModule.default.fetch).toBe(handleWorkerRequest);
	});
});
