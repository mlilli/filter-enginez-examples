/**
 * CI checks the engine out at the commit pinned in `.github/engine-ref`, never at a moving branch.
 *
 * @remarks
 * This repo installs the engine from tarballs packed from a sibling checkout, and
 * `pnpm install --frozen-lockfile` verifies each tarball's integrity hash. Those hashes change with
 * every engine commit, so an unpinned checkout breaks this repo's CI on the next engine change. The pin
 * file and the lockfile move together through `scripts/pin-engine-ref.sh`.
 *
 * This guard covers the two halves a later edit could quietly undo:
 *
 * - the pin file holds a full 40-character commit SHA — or the placeholder `unpinned`, which the
 *   workflow itself refuses, so it cannot reach a green run;
 * - the workflow reads that file and passes it as the engine checkout's `ref`.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIN = readFileSync(resolve(REPO_ROOT, '.github/engine-ref'), 'utf8').trim();
const WORKFLOW = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

describe('the engine checkout in CI is pinned', () => {
	it('pins a full commit SHA (or the placeholder the workflow refuses)', () => {
		expect(PIN, `.github/engine-ref holds '${PIN}' — run scripts/pin-engine-ref.sh`).toMatch(/^(?:[0-9a-f]{40}|unpinned)$/u);
	});

	it('refuses anything but a SHA before checking out', () => {
		expect(WORKFLOW).toContain('.github/engine-ref');
		expect(WORKFLOW).toContain("grep -Eq '^[0-9a-f]{40}$'");
	});

	it('checks the engine out at the pinned ref, in every job that checks it out', () => {
		// `gates` and `deploy` each clone the engine; a second checkout added unpinned would build the
		// deployed sites against whatever the engine's `main` happens to be.
		const engineCheckouts = [...WORKFLOW.matchAll(/repository: mlilli\/filter-enginez\n(?: {10}.*\n)*/gu)].map(([step]) => step);

		expect(engineCheckouts.length, 'no engine checkout step found in ci.yml').toBeGreaterThanOrEqual(1);
		for (const engineCheckout of engineCheckouts) {
			expect(engineCheckout, 'an engine checkout has no pinned ref').toContain('ref: ${{ steps.engine.outputs.sha }}');
		}
	});
});
