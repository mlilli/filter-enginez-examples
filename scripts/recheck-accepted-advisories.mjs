#!/usr/bin/env node
/**
 * Re-check the stated precondition of every accepted advisory, against the registry.
 *
 * @remarks
 * Usage: `node scripts/recheck-accepted-advisories.mjs`
 *   Exits **non-zero** when any precondition no longer holds — i.e. when an advisory this repo
 *   suppresses has become fixable and the suppression should be retired.
 *
 * ## Why this exists
 *
 * `auditConfig.ignoreGhsas` makes `pnpm audit` print "All found vulnerabilities were already reviewed
 * and decided to be ignored". That is the right outcome for advisories that genuinely cannot be
 * fixed yet — but it has a sharp edge, and the question that exposes it is why a **high** is being
 * hidden at all:
 *
 * 🔴 **Every justification is conditional on a dependency tree that moves, and nothing re-evaluates
 * the conditions.** The re-review triggers were prose ("re-review when deepmerge publishes a fix"), in
 * a file no gate reads. `pnpm audit` cannot tell you the premise expired — suppression is exactly what
 * stops it from mentioning the package at all. So an unfixable high in dev tooling would stay
 * invisible on the day it became fixable, which is the moment you most want to hear about it.
 *
 * ⚠ The shape is common: a suppression whose package has left the tree is inert, and one whose
 * recorded trigger has already fired stays silent anyway. **A dormant claim is not a checked one.**
 * This script is the instrument that makes each acceptance falsifiable.
 *
 * ## Why a script rather than a vitest guard
 *
 * It needs the network, which a vitest guard must not — so it is run by hand whenever an
 * acceptance is added or reviewed, and every Monday by `.github/workflows/audit.yml`. The
 * preconditions that need **no** network (that no math extension is enabled, which is what makes the
 * KaTeX advisory unreachable, and that `examples-sveltekit` uses neither `use:enhance` nor
 * `setHeaders`) are ALSO asserted in `tests/tooling/acceptedAdvisoryParity.test.ts`, because they are
 * the only ones a change inside this repo can invalidate, and they are free to check there.
 *
 * 🟢 The division is deliberate: static preconditions are guarded continuously, registry preconditions
 * are re-checked weekly and on demand. Neither is left to memory.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Compare two dot-separated numeric versions.
 *
 * @remarks
 * Deliberately NOT a `semver` dependency. Every version this script compares is a plain `x.y.z`
 * release (e.g. `3.0.3`), `semver` is not a root dependency, and adding one to a
 * supply-chain script to parse four numbers would be its own small joke. Prereleases would need real
 * semver — if one ever appears here, that is the moment to take the dependency rather than to extend
 * this.
 *
 * @param {string} left - A version string.
 * @param {string} right - A version string.
 * @returns {number} Negative when `left` sorts first, positive when `right` does, zero when equal.
 */
function compareVersions(left, right) {
	const l = left.split('.').map(Number);
	const r = right.split('.').map(Number);

	for (let i = 0; i < Math.max(l.length, r.length); i++) {
		const diff = (l[i] ?? 0) - (r[i] ?? 0);

		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
}

/**
 * The subset of a registry manifest this script reads.
 *
 * @remarks
 * Declared rather than left implicit because `tsconfig.node.json` type-checks `scripts/**` with
 * `checkJs`, so `response.json()`'s `any` would otherwise spread untyped property access through every
 * precondition, and an implicit-any parameter fails `pnpm typecheck`.
 *
 * @typedef {object} RegistryManifest
 * @property {string} version - The published version of the `latest` dist-tag.
 * @property {Record<string, string> | undefined} [dependencies] - Runtime deps, when the check needs them.
 */

/**
 * The `latest` dist-tag manifest for a package.
 *
 * @param {string} name - Package name, scoped names included.
 * @returns {Promise<RegistryManifest>} The parsed manifest.
 */
async function latestManifest(name) {
	const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`registry returned ${String(response.status)} for ${name}`);
	}

	return response.json();
}

/**
 * The names of the packages whose lockfile snapshot depends on `name`, sorted and deduplicated.
 *
 * @remarks
 * Local, no network: it reads `pnpm-lock.yaml`'s `snapshots` section, where each entry lists the
 * versions it resolved for its dependencies. A premise that names the callers of a vulnerable package
 * uses it to notice a new caller, whose use of it nobody has read yet.
 *
 * @param {string} name - The dependency to look for.
 * @param {(version: string) => boolean} [accepts] - Keeps only dependents whose resolved version passes.
 * @returns {string[]} The dependents' package names.
 */
function lockfileDependents(name, accepts = () => true) {
	const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');
	const snapshots = lockfile.slice(lockfile.indexOf('\nsnapshots:\n'));
	const dependents = new Set();
	let current = '';

	for (const line of snapshots.split('\n')) {
		const entry = /^ {2}'?(?<key>@?[^@\s']+)@/u.exec(line);

		if (entry?.groups !== undefined) {
			current = entry.groups['key'] ?? '';
		} else if (line.startsWith(`      ${name}: `) || line.startsWith(`      '${name}': `)) {
			const resolved = line.slice(line.indexOf(': ') + 2).replace(/^'|\(.*$|'$/gu, '');

			if (accepts(resolved)) {
				dependents.add(current);
			}
		}
	}

	return [...dependents].sort();
}

/**
 * When a version was published, in milliseconds since the epoch.
 *
 * @remarks
 * It reads the package's full registry document, whose `time` map the `latest` manifest lacks. Only a
 * check that has found a fix calls it, so the larger documents are fetched rarely.
 *
 * @param {string} name - Package name, scoped names included.
 * @param {string} version - The published version.
 * @returns {Promise<number>} The publish time.
 */
async function publishedAt(name, version) {
	const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);

	if (!response.ok) {
		throw new Error(`registry returned ${String(response.status)} for ${name}`);
	}

	/** @type {{ time?: Record<string, string> }} */
	const document = await response.json();
	const published = Date.parse(document.time?.[version] ?? '');

	if (Number.isNaN(published)) {
		throw new Error(`the registry gives no publish time for ${name}@${version}`);
	}

	return published;
}

/**
 * pnpm's release-age quarantine, read from `pnpm-workspace.yaml`, in milliseconds.
 *
 * @remarks
 * A fix inside the quarantine cannot be installed yet (`pnpm install` refuses it), so it does not
 * expire an acceptance; it does on the day the quarantine ends.
 *
 * @returns {number} `minimumReleaseAge`, converted from minutes.
 */
function releaseAgeMs() {
	const minutes = /^minimumReleaseAge:\s*(?<minutes>\d+)\s*$/mu.exec(readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8'));

	if (minutes?.groups === undefined) {
		throw new Error('pnpm-workspace.yaml sets no minimumReleaseAge');
	}

	return Number(minutes.groups['minutes']) * 60_000;
}

/**
 * The major version a dependency range starts at: 11 for `^11.0.5` or `~11.0.4`.
 *
 * @param {string} range - A range as a manifest declares it.
 * @returns {number} The first number in it, or `NaN` when there is none.
 */
function majorOf(range) {
	return Number(/\d+/u.exec(range)?.[0] ?? Number.NaN);
}

/**
 * Which source files of the SvelteKit app match `pattern`, out of how many read?
 *
 * @remarks
 * Static, no network. Mirrored in `acceptedAdvisoryParity.test.ts`, which runs continuously, because
 * the two SvelteKit acceptances rest on the app never using a feature, and only a change inside this
 * repository can start using one. The count is returned so a check can refuse to pass on zero files.
 *
 * @param {RegExp} pattern - What to look for.
 * @returns {{ matching: string[], read: number }} The matching files, relative to the app, and the count read.
 */
function sveltekitSourcesMatching(pattern) {
	const app = join(ROOT, 'packages/examples-sveltekit');
	const files = readdirSync(join(app, 'src'), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(?:svelte|ts|js)$/u.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));

	return {
		matching: files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(app, file)).sort(),
		read: files.length,
	};
}

/**
 * Where the SvelteKit app defines or enables remote functions, the feature two kit advisories live in.
 *
 * @remarks
 * Static, no network. Mirrored in `acceptedAdvisoryParity.test.ts`, which runs continuously. Remote
 * functions need the `kit.experimental.remoteFunctions` flag in `svelte.config.js`, a `*.remote.ts` (or
 * `.js`) module, and `form`, `query` or `command` from `$app/server`; any one of them appearing is a
 * reason to re-decide.
 *
 * @returns {{ found: string[], read: number }} Each finding as a note, and how many source files were read.
 */
function sveltekitRemoteFunctions() {
	const app = join(ROOT, 'packages/examples-sveltekit');
	const found = readdirSync(join(app, 'src'), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.remote\.[jt]s$/u.test(entry.name))
		.map((entry) => `${relative(app, join(entry.parentPath, entry.name))} is a remote module`);
	const { matching, read } = sveltekitSourcesMatching(/['"]\$app\/server['"]/u);

	found.push(...matching.map((file) => `${file} imports $app/server`));

	if (/\bremoteFunctions\b/u.test(readFileSync(join(app, 'svelte.config.js'), 'utf8'))) {
		found.push('svelte.config.js sets remoteFunctions');
	}

	return { found: found.sort(), read };
}

/**
 * The outcome both remote-function acceptances share: they hold while the app uses no remote functions.
 *
 * @returns {{ action: string, detail: string, holds: boolean }} The check's result.
 */
function remoteFunctionsUnused() {
	const { found, read } = sveltekitRemoteFunctions();

	return {
		action: read === 0
			? 'no examples-sveltekit source file was read — fix the scan before trusting this premise'
			: 'examples-sveltekit now uses remote functions — this acceptance no longer holds; move to kit 3.1.1 or later',
		detail: `remote functions in ${String(read)} examples-sveltekit files and svelte.config.js: ${found.join(', ') || 'none'}`,
		holds: read > 0 && found.length === 0,
	};
}

/**
 * The accepted advisories and the PRECONDITION each acceptance rests on.
 *
 * @remarks
 * ⚠ This list is held to `auditConfig.ignoreGhsas` and to `SECURITY.md`'s table by
 * `tests/tooling/acceptedAdvisoryParity.test.ts` — all three must name the same GHSA set. Adding a
 * suppression without a precondition here fails that guard, which is the point: an acceptance with no
 * stated, checkable premise is exactly the kind that silently expires.
 */
const ACCEPTED = [
	{
		// Static — no network. Mirrored in acceptedAdvisoryParity.test.ts, which runs continuously.
		check() {
			const config = readFileSync(join(ROOT, '.markdownlint-cli2.yaml'), 'utf8');
			const enabled = /^\s*(?:math|katex)\s*:/imu.test(config);

			return Promise.resolve({
				action: 'math is now enabled — KaTeX renders, so this acceptance no longer holds',
				detail: `.markdownlint-cli2.yaml ${enabled ? 'ENABLES a math/katex setting' : 'enables no math extension'}`,
				holds: !enabled,
			});
		},
		ghsa: 'GHSA-238p-pmpm-9mq7',
		premise: 'no math extension is enabled, so KaTeX never renders',
		severity: 'low',
	},
	{
		async check() {
			// Each was read for `optimizationLevel`. The four lint callers leave it at the default, 1;
			// glob sets 2, so it and editorconfig are allowed only while js-beautify is their sole parent.
			// `via`: only a release of that package moves this one, by allowing the major in `from`, the
			// first on minimatch 11 (glob 14.0.0, editorconfig 4.0.0). The rest move with their own release,
			// which their parents' ranges admit or which typescript-eslint ships in lockstep.
			/** @type {Record<string, { via?: string, from?: number }>} */
			const moves = {
				'@eslint/config-array': {},
				'@typescript-eslint/typescript-estree': {},
				editorconfig: { from: 4, via: 'js-beautify' },
				eslint: {},
				'eslint-plugin-jsx-a11y-x': {},
				glob: { from: 14, via: 'js-beautify' },
			};
			// Patched in 11.0.1. Only the dependents that resolve an older minimatch matter.
			const vulnerable = lockfileDependents('minimatch', (version) => compareVersions(version, '11.0.1') < 0);
			const unread = vulnerable.filter((dependent) => !Object.hasOwn(moves, dependent));
			const cliOnly = ['editorconfig', 'glob'].every((name) => lockfileDependents(name).join() === 'js-beautify');
			const quarantine = releaseAgeMs();
			/** @type {string[]} */
			const installable = [];
			/** @type {string[]} */
			const quarantined = [];
			/** @type {string[]} */
			const unfixed = [];

			for (const dependent of vulnerable) {
				const move = moves[dependent];

				if (move === undefined) {
					continue;
				}

				const owner = move.via ?? dependent;
				const latest = await latestManifest(owner);
				const range = latest.dependencies?.[move.via === undefined ? 'minimatch' : dependent];
				const label = move.via === undefined
					? `${dependent}@${latest.version} (minimatch ${range ?? 'dropped'})`
					: `${dependent} via ${owner}@${latest.version} (${dependent} ${range ?? 'dropped'})`;

				if (range !== undefined && !(majorOf(range) >= (move.from ?? 11))) {
					unfixed.push(label);
					continue;
				}

				const clears = (await publishedAt(owner, latest.version)) + quarantine;

				if (clears <= Date.now()) {
					installable.push(label);
				} else {
					quarantined.push(`${label}, installable from ${new Date(clears).toISOString().slice(0, 16)}Z`);
				}
			}

			let action = `${unread.join(', ')} now resolve(s) minimatch 10 — check whether it sets optimizationLevel >= 2`;

			if (vulnerable.length === 0) {
				action = 'nothing in the lockfile resolves minimatch < 11.0.1 any more — retire this acceptance';
			} else if (installable.length > 0) {
				action = `upgrade ${installable.join(', ')}: past the quarantine and on minimatch 11. `
					+ 'Retire this acceptance once nothing resolves minimatch < 11.0.1';
			} else if (!cliOnly) {
				action = 'glob or editorconfig gained a parent besides js-beautify — check whether that caller runs it';
			}

			return {
				action,
				detail: `minimatch < 11.0.1 resolved for: ${vulnerable.join(', ') || 'none'}; `
					+ `no fix yet: ${unfixed.join(', ') || 'none'}; `
					+ `fixed, inside the quarantine: ${quarantined.join(', ') || 'none'}; `
					+ `fixed and installable: ${installable.join(', ') || 'none'}` + `; glob and editorconfig ${cliOnly ? 'only' : 'NOT only'} under js-beautify`,
				holds: vulnerable.length > 0 && unread.length === 0 && installable.length === 0 && cliOnly,
			};
		},
		ghsa: 'GHSA-g3hv-75wg-m249',
		premise: 'every package resolving minimatch 10 has no release on 11 past the quarantine, and the only caller at optimizationLevel 2 is glob under js-beautify\'s CLI',
		severity: 'moderate',
	},
	{
		async check() {
			const beautify = await latestManifest('js-beautify');
			const requires = beautify.dependencies?.['glob'] ?? '(none)';
			const parents = lockfileDependents('glob');
			const beautifyParents = lockfileDependents('js-beautify');
			const onlyPath = parents.join() === 'js-beautify' && beautifyParents.join() === '@vue/test-utils';

			return {
				action: onlyPath
					? `js-beautify now requires glob ${requires} — upgrade it and retire this acceptance`
					: 'glob or js-beautify gained another parent — check whether that caller passes an AbortSignal',
				detail: `js-beautify@${beautify.version} requires glob ${requires}; glob's parents: ${parents.join(', ') || 'none'}; `
					+ `js-beautify's parents: ${beautifyParents.join(', ') || 'none'}`,
				holds: requires.startsWith('^13') && onlyPath,
			};
		},
		ghsa: 'GHSA-3g3m-2fjr-6pw4',
		premise: 'glob is reached only through js-beautify (under @vue/test-utils), which still requires glob 13',
		severity: 'moderate',
	},
	{
		async check() {
			const deepmerge = await latestManifest('deepmerge');
			const fixed = compareVersions(deepmerge.version, '4.3.1') > 0;

			return {
				action: `deepmerge ${deepmerge.version} is published — update the lockfile and retire this acceptance`,
				detail: `deepmerge latest=${deepmerge.version} (vulnerable <=4.3.1)`,
				holds: !fixed,
			};
		},
		ghsa: 'GHSA-gcqx-w48m-w2h4',
		premise: 'deepmerge has no published fix',
		severity: 'low',
	},
	{
		// Static — no network. Mirrored in acceptedAdvisoryParity.test.ts, which runs continuously.
		check() {
			const { matching, read } = sveltekitSourcesMatching(/use:enhance/u);

			return Promise.resolve({
				action: read === 0
					? 'no examples-sveltekit source file was read — fix the scan before trusting this premise'
					: 'examples-sveltekit now uses use:enhance — this acceptance no longer holds; move to kit 3',
				detail: `use:enhance in ${String(read)} examples-sveltekit files: ${matching.join(', ') || 'none'}`,
				holds: read > 0 && matching.length === 0,
			});
		},
		ghsa: 'GHSA-pfhg-q3qv-9q6r',
		premise: 'examples-sveltekit has no use:enhance form, so the open redirect cannot occur',
		severity: 'low',
	},
	{
		// Static — no network. Mirrored in acceptedAdvisoryParity.test.ts, which runs continuously.
		check() {
			const { matching, read } = sveltekitSourcesMatching(/\bsetHeaders\b/u);

			return Promise.resolve({
				action: read === 0
					? 'no examples-sveltekit source file was read — fix the scan before trusting this premise'
					: 'examples-sveltekit now calls setHeaders — this acceptance no longer holds; move to kit 3',
				detail: `setHeaders in ${String(read)} examples-sveltekit files: ${matching.join(', ') || 'none'}`,
				holds: read > 0 && matching.length === 0,
			});
		},
		ghsa: 'GHSA-27mw-82g8-phjj',
		premise: 'examples-sveltekit never calls setHeaders, so no cache-control value reaches a prerendered page',
		severity: 'low',
	},
	{
		// Static — no network. Mirrored in acceptedAdvisoryParity.test.ts, which runs continuously.
		check() {
			return Promise.resolve(remoteFunctionsUnused());
		},
		ghsa: 'GHSA-3r8g-jcqq-3p5j',
		premise: 'examples-sveltekit uses no remote functions, so no remote form parses request data',
		severity: 'high',
	},
	{
		// Static — no network. Mirrored in acceptedAdvisoryParity.test.ts, which runs continuously.
		check() {
			return Promise.resolve(remoteFunctionsUnused());
		},
		ghsa: 'GHSA-6cf5-gc4q-fm3x',
		premise: 'examples-sveltekit uses no remote functions, so no query.batch exists to collide',
		severity: 'moderate',
	},
];

const results = [];

for (const entry of ACCEPTED) {
	try {
		results.push({ entry, outcome: await entry.check() });
	} catch (error) {
		results.push({
			entry,
			outcome: {
				action: 'resolve the error above, then re-run — an unverifiable premise is not a held one',
				detail: `check could not run: ${error instanceof Error ? error.message : String(error)}`,
				holds: false,
			},
		});
	}
}

let expired = 0;

for (const { entry, outcome } of results) {
	const mark = outcome.holds ? '✓' : '✗';

	console.log(`${mark} ${entry.ghsa}  (${entry.severity})`);
	console.log(`    premise: ${entry.premise}`);
	console.log(`    checked: ${outcome.detail}`);

	if (!outcome.holds) {
		expired += 1;
		console.log(`    🔴 ACTION: ${outcome.action}`);
	}
}

console.log('');

if (expired > 0) {
	console.error(
		`✗ ${String(expired)} of ${String(ACCEPTED.length)} acceptance(s) no longer hold. Retire them from\n`
		+ '  `auditConfig.ignoreGhsas` in pnpm-workspace.yaml and from SECURITY.md, then re-run `pnpm audit`.',
	);
	process.exit(1);
}

console.log(
	`✓ all ${String(ACCEPTED.length)} acceptance(s) still hold. Update SECURITY.md's "Last reviewed" date.`,
);
