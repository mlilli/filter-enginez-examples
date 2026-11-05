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
 * the conditions.** The re-review triggers were prose ("re-review when `braces` publishes a fix"), in
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
 * It needs the network, which a vitest guard must not — so it is run by hand, whenever an
 * acceptance is added or reviewed. The one precondition that needs **no** network (that no math extension is
 * enabled, which is what makes the KaTeX advisory unreachable) is ALSO asserted in
 * `tests/tooling/acceptedAdvisoryParity.test.ts`, because it is the only one a change inside this repo
 * can invalidate, and it is free to check there.
 *
 * 🟢 The division is deliberate: static preconditions are guarded continuously, registry preconditions
 * are re-checked on demand. Neither is left to memory.
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
 * @returns {string[]} The dependents' package names.
 */
function lockfileDependents(name) {
	const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');
	const snapshots = lockfile.slice(lockfile.indexOf('\nsnapshots:\n'));
	const dependents = new Set();
	let current = '';

	for (const line of snapshots.split('\n')) {
		const entry = /^ {2}'?(?<key>@?[^@\s']+)@/u.exec(line);

		if (entry?.groups !== undefined) {
			current = entry.groups['key'] ?? '';
		} else if (line.startsWith(`      ${name}: `) || line.startsWith(`      '${name}': `)) {
			dependents.add(current);
		}
	}

	return [...dependents].sort();
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
		async check() {
			const braces = await latestManifest('braces');
			const micromatch = await latestManifest('micromatch');
			const fixed = compareVersions(braces.version, '3.0.3') > 0;
			// Bracket access, not dotted: `noPropertyAccessFromIndexSignature` is on, and a dotted read of
			// an index-signature key is the error TS4111 that `tsconfig.node.json` exists to catch.
			const requires = micromatch.dependencies?.['braces'] ?? '(none)';

			return {
				action: fixed
					? `braces ${braces.version} is published — drop the override-free acceptance and upgrade`
					: `micromatch moved to ${requires} — re-check whether a patched braces is now reachable`,
				detail: `braces latest=${braces.version} (vulnerable <=3.0.3), micromatch@${micromatch.version} requires braces ${requires}`,
				holds: !fixed && requires.startsWith('^3'),
			};
		},
		ghsa: 'GHSA-vfj7-8cjw-p6xm',
		premise: 'braces has no published fix, and micromatch still requires the vulnerable major',
		severity: 'high',
	},
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
			const eslint = await latestManifest('eslint');
			const eslintRange = eslint.dependencies?.['minimatch'] ?? '(none)';
			// Each was read for `optimizationLevel`. The four lint callers leave it at the default, 1;
			// glob sets 2, so it and editorconfig are allowed only while js-beautify is their sole parent.
			const known = [
				'@eslint/config-array',
				'@typescript-eslint/typescript-estree',
				'editorconfig',
				'eslint',
				'eslint-plugin-jsx-a11y-x',
				'glob',
			];
			const dependents = lockfileDependents('minimatch');
			const unread = dependents.filter((dependent) => !known.includes(dependent));
			const cliOnly = ['editorconfig', 'glob'].every((name) => lockfileDependents(name).join() === 'js-beautify');
			const pinned = eslintRange.startsWith('^10');
			let action = `${unread.join(', ')} now depend(s) on minimatch — check whether it sets optimizationLevel >= 2`;

			if (dependents.length === 0) {
				action = 'nothing in the lockfile depends on minimatch any more — retire this acceptance';
			} else if (!pinned) {
				action = 'eslint moved to another minimatch major — upgrade to a patched one and retire this acceptance';
			} else if (!cliOnly) {
				action = 'glob or editorconfig gained a parent besides js-beautify — check whether that caller runs it';
			}

			return {
				action,
				detail: `eslint@${eslint.version} requires minimatch ${eslintRange}; lockfile dependents: `
					+ `${dependents.join(', ') || 'none'}; glob and editorconfig ${cliOnly ? 'only' : 'NOT only'} under js-beautify`,
				holds: pinned && dependents.length > 0 && unread.length === 0 && cliOnly,
			};
		},
		ghsa: 'GHSA-g3hv-75wg-m249',
		premise: 'eslint still requires minimatch 10, and the only caller at optimizationLevel 2 is glob under js-beautify\'s CLI',
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
