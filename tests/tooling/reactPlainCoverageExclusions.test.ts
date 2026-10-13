/**
 * The `examples-react-plain` coverage-exclusion list, asserted against the tree it describes.
 *
 * @remarks
 * ### Why a list, and why its shape differs from vanilla's
 *
 * The six verticals' app surface is e2e-only, and a single blanket glob over this package would say
 * so — while also silently un-measuring `src/lab/`, which has a unit suite of its own. So the
 * exclusion is a list in `vitest.coverage.config.ts` that names the app surface and leaves `lab` in
 * scope.
 *
 * The list is a **TAXONOMY**, and `vanillaCoverageExclusions.test.ts`'s is a **DEBT REGISTER**. That
 * distinction is the reason these are two files rather than one parameterized suite, and it drives
 * opposite assertions: vanilla's guard requires individual MODULES (a directory sweep there would be
 * a blanket wearing a list's clothes, silently un-measuring hundreds of cases), while this one expects
 * DIRECTORIES, because naming every module would read as debt somebody ought to pay down.
 * Nobody should: they are route shells and dataset apps whose gate is a real browser.
 *
 * ### The assertion vanilla's guard explicitly declines to make
 *
 * That file says completeness is a coverage question and coverage is not available under plain Node.
 * True there, because its list is per-module and only a measurement can say which modules belong.
 *
 * Here the policy is per-DIRECTORY, which makes completeness a filesystem question — so this guard
 * makes it. Every directory under `examples-react-plain/src` must be either excluded or in
 * {@link COVERED}, and a new `src/whatever/` fails until somebody decides which it is. Drift is
 * closed in both directions rather than only the direction a blanket closes.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { excludedGlobsFor, REPO_ROOT } from './support/coverageExclusions.js';

/** The package this list describes, relative to the repo root. */
const PACKAGE_PREFIX = 'examples-react-plain/src/';

/** Where the package's source lives. */
const SOURCE_DIRECTORY = resolve(REPO_ROOT, 'packages/examples-react-plain/src');

/**
 * Directories deliberately IN coverage scope, each with the reason it is worth the obligation.
 *
 * @remarks
 * - `lab` — the point of the list. Held at 100% on all four counters by the repo-wide thresholds
 *   that `pnpm test:coverage` enforces.
 * - `types` — `.d.ts` only, dropped by the global `**\/*.d.ts` exclusion before this list is
 *   consulted at all.
 * - `routes` — `DatasetRoute.tsx` is covered; only `routes/LandingPage.tsx` is excluded. ⚠ It is the
 *   only entry here that is PARTLY excluded: the
 *   directory is covered, one file inside it is not. The completeness case below keys on directory
 *   globs ending in `/**`, so a file-level exclusion leaves its directory looking uncovered — which
 *   is why `routes` has to be here for the gate to stay green, and why this bullet says so rather
 *   than leaving the next reader to work out that `routes` is not covered end to end.
 */
const COVERED: readonly string[] = ['lab', 'routes', 'types'];

/** The list's entries, with the `**\/` prefix already stripped. */
const globs = (): readonly string[] => excludedGlobsFor('examples-react-plain');

describe('the examples-react-plain coverage-exclusion list', () => {
	it('is not empty — the vacuity guard for every assertion below', () => {
		// 🔴 Every other case in this file filters the list and expects `[]`. An EMPTY list satisfies
		// all of them, having compared nothing — so a reader pointed at the wrong file, or a regex
		// broken by a refactor, would turn this whole suite green while measuring nothing.
		//
		// The list lives in `vitest.coverage.config.ts`, apart from `vitest.config.ts`; if the reader is
		// ever aimed at the wrong file, only this case says so.
		expect(globs().length).toBeGreaterThan(0);
	});

	it('names paths that still exist', () => {
		// The failure this exists for: a module or directory is renamed, its entry is left behind, and
		// the list goes on advertising an exclusion that excludes nothing. A glob matching nothing is
		// indistinguishable, in every report, from a glob doing its job.
		const missing = globs().filter((glob) => {
			const path = glob.replace(/\/\*\*$/u, '');

			return !existsSync(resolve(REPO_ROOT, 'packages', path));
		});

		expect(missing, 'excluded paths that no longer exist — delete the entries or fix the paths').toEqual([]);
	});

	it('names only paths inside examples-react-plain/src', () => {
		// The quiet inverse: an entry reaching outside the package would drop somebody else's file
		// from the report and RAISE the global aggregate, so nothing would ever go red.
		const strays = globs().filter((glob) => !glob.startsWith(PACKAGE_PREFIX));

		expect(strays, 'exclusion entries pointing outside examples-react-plain/src').toEqual([]);
	});

	it('does not reintroduce a package-wide blanket', () => {
		// The easy fix under time pressure, and the one that would silently un-measure src/lab:
		// a single `'**\/examples-react-plain/**'` restores a green gate instantly.
		const blankets = globs().filter((glob) => glob === 'examples-react-plain/**' || glob === 'examples-react-plain/src/**');

		expect(blankets, 'a package-wide blanket — the list must name directories or modules').toEqual([]);
	});

	it('has no duplicate entries', () => {
		// Two entries for one path is a merge artifact, and it hides a disagreement: whichever reason
		// was written second is the one a reader will not see.
		const entries = globs();
		const duplicates = entries.filter((glob, index) => entries.indexOf(glob) !== index);

		expect(duplicates, 'duplicated exclusion entries').toEqual([]);
	});

	it('accounts for EVERY directory under src — excluded or covered, never neither', () => {
		// 🔴 The assertion the vanilla guard declines to make, and the reason this policy is
		// per-directory: it turns completeness from a coverage question into a filesystem one.
		//
		// Without it, a new `src/whatever/` lands silently IN scope. That is the correct default —
		// a module is covered unless somebody argues otherwise — but "correct default" and "nobody
		// noticed" are the same thing until a gate says so, and the gate that would say so is the
		// pre-push hook, at 100% thresholds, after the fact.
		const excludedDirectories = new Set(
			globs()
				.filter((glob) => glob.endsWith('/**'))
				.map((glob) => glob.slice(PACKAGE_PREFIX.length, -'/**'.length)),
		);
		const covered = new Set(COVERED);
		const undecided = readdirSync(SOURCE_DIRECTORY, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => !excludedDirectories.has(name) && !covered.has(name));

		expect(
			undecided,
			'directories under examples-react-plain/src that are neither excluded nor in COVERED — decide which, and say why',
		).toEqual([]);
	});

	it('does not claim to cover a directory that no longer exists', () => {
		// The mirror of the case above, and the one a rename breaks: COVERED going stale would leave
		// a directory silently exempt from the completeness check rather than failing it.
		const phantom = COVERED.filter((name) => !existsSync(resolve(SOURCE_DIRECTORY, name)));

		expect(phantom, 'COVERED names directories that do not exist').toEqual([]);
	});

	it('keeps src/lab OUT of the exclusion list', () => {
		// The whole point, asserted directly rather than left as the absence of an entry. An absence
		// is not self-documenting: a reader cannot tell "deliberately in scope" from "nobody got to
		// it yet", and this is the line that says which.
		const labEntries = globs().filter((glob) => glob.startsWith(`${PACKAGE_PREFIX}lab`));

		expect(
			labEntries,
			'src/lab is excluded — it is in coverage scope on purpose, so its 100% is measured rather than assumed',
		).toEqual([]);
	});
});
