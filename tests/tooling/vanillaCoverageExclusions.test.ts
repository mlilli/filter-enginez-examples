/**
 * The `examples-vanilla` coverage-exclusion list, asserted against the tree it describes.
 *
 * @remarks
 * ### What this pins, and why a list needs pinning at all
 *
 * The vanilla app's unit suites are measured; its untested modules are excluded BY NAME in
 * `vitest.coverage.config.ts`, not by a blanket `'**\/examples-vanilla/**'` glob, which would leave
 * every suite in the package running on `pnpm test` and measured by nothing. The list is a debt
 * register: an entry is meant to be deletable, and the count is expected to move as modules gain
 * suites.
 *
 * This file deliberately does not characterize the remaining entries (unreached versus partially
 * covered). Coverage is transitive — a module reached through another module's suite has no sibling
 * `*.test.ts` to notice — so any such sentence is a proxy for a measurement, and a proxy for coverage
 * is not coverage. The per-file table is re-derivable with `bash scripts/measure-vanilla-coverage.sh`.
 *
 * A named list decays in a way a blanket cannot. Rename or delete a module and its entry stays
 * behind, matching nothing — and a glob matching nothing is indistinguishable, in every report, from
 * a glob doing its job. The list would keep implying those exclusions matter while quietly covering
 * nothing, and the next reader would inherit a register they cannot trust. So every path is checked
 * to exist.
 *
 * This is the same guarantee `examplesSharedComponentSplit.test.ts` gives the PascalCase glob in the
 * same list, arrived at from the other direction: that one asserts a convention the glob
 * reads, this one asserts the files the list names.
 *
 * ### Why it also asserts the list is a SUBSET of the package
 *
 * The inverse error is quieter still. An entry for a path outside `examples-vanilla` would exclude
 * something nobody intended and never fail anything — coverage would simply drop a file, and the
 * global aggregate would go UP.
 *
 * ### Why it does not assert the list is complete
 *
 * Completeness is a coverage question, and coverage is not available here — this project runs under
 * plain Node and reads the filesystem. `bash scripts/measure-vanilla-coverage.sh` is what re-derives
 * which modules belong on the list; this file only ensures the list stays honest about the ones it
 * already names.
 *
 * @packageDocumentation
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { excludedGlobsFor, REPO_ROOT } from './support/coverageExclusions.js';

/** The package the list describes, relative to the repo root. */
const PACKAGE_PREFIX = 'examples-vanilla/src/';

/**
 * Every `examples-vanilla` path named in the config's `coverage.exclude`.
 *
 * @remarks
 * The reader lives in `support/coverageExclusions.ts`, shared with
 * `reactPlainCoverageExclusions.test.ts`, and its 🔴 comment-stripping notes live WITH the code they
 * describe. Shared rather than copied, because a fix to one copy of two reaches neither reliably.
 *
 * The POLICY assertions below stay here, because the two lists genuinely differ. This one is a debt
 * register and must name individual modules; react-plain's is a taxonomy and names directories.
 *
 * @returns The globs, in the order they appear.
 */
function excludedVanillaGlobs(): readonly string[] {
	return excludedGlobsFor('examples-vanilla');
}

describe('the examples-vanilla coverage-exclusion list', () => {
	it('is not empty — the vacuity guard for every assertion below', () => {
		// 🔴 All four cases below filter the list and expect `[]`, so an EMPTY list passes every one of
		// them having compared nothing — a reader aimed at the wrong file, or a regex broken by a
		// refactor, would leave this suite green while asserting nothing at all. The list lives apart
		// from `vitest.config.ts`, in `vitest.coverage.config.ts`, so a wrongly aimed reader is a real
		// possibility rather than a theoretical one.
		expect(excludedVanillaGlobs().length).toBeGreaterThan(0);
	});

	it('names paths that still exist', () => {
		// The failure this exists for: a module is renamed, its entry is left behind, and the register
		// goes on listing an exclusion that excludes nothing. Reported all at once rather than one at
		// a time, so a rename that moved several files gives the whole answer in one run.
		const missing = excludedVanillaGlobs().filter(
			(path) => !existsSync(resolve(REPO_ROOT, 'packages', path)),
		);

		expect(missing, 'excluded paths that no longer exist — delete the entries or fix the paths').toEqual([]);
	});

	it('names only files inside examples-vanilla/src', () => {
		// The quiet inverse: an entry reaching outside the package would drop someone else's file from
		// the report and RAISE the global number, so nothing would ever go red.
		const strays = excludedVanillaGlobs().filter((path) => !path.startsWith(PACKAGE_PREFIX));

		expect(strays, 'exclusion entries pointing outside examples-vanilla/src').toEqual([]);
	});

	it('names individual modules rather than reintroducing a blanket', () => {
		// The regression that matters most, because it is the easy fix under time pressure: one
		// `'**\/examples-vanilla/**'` restores a green gate instantly and silently un-measures 226
		// cases. Anything not ending in a real extension is a directory sweep wearing a list's clothes.
		const sweeps = excludedVanillaGlobs().filter((path) => !path.endsWith('.ts'));

		expect(sweeps, 'directory-wide globs — the list must name modules, see the config comment').toEqual([]);
	});

	it('has no duplicate entries', () => {
		// Two entries for one path is a merge artifact, and it hides a disagreement: whichever reason
		// was written second is the one a reader will not see.
		const globs = excludedVanillaGlobs();
		const duplicates = globs.filter((path, index) => globs.indexOf(path) !== index);

		expect(duplicates, 'duplicated exclusion entries').toEqual([]);
	});
});
