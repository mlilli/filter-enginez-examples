/**
 * `deploy-targets` — the sites the deploy job ships, read from the packages that declare one.
 *
 * @remarks
 * A package is deployed if and only if it has a `wrangler.jsonc`. There is no second list: the deploy
 * job in `.github/workflows/ci.yml` builds its matrix from {@link listDeployTargets} (through the
 * `list-deploy-targets.mjs` CLI), and `tests/tooling/cloudflareDeploy.test.ts` checks the same
 * targets against the verticals registry, the sitemap and the landing page. Adding a site is adding
 * its `wrangler.jsonc`.
 *
 * Pure: reads files, returns data, never exits — `tests/tooling` imports it, so it must not have the
 * side effects of a CLI (see `e2e-ports.mjs` for the same split).
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The Wrangler configuration file a deployable package carries, at its root. */
export const WRANGLER_CONFIG_FILE = 'wrangler.jsonc';

/**
 * Parse JSON with comments — the subset Wrangler's `.jsonc` files use: `//` and `/* *\/` comments and
 * trailing commas.
 *
 * @remarks
 * A small scanner rather than a regex, because a regex cannot tell a comment from `//` inside a
 * string (`"https://…"`), and a URL is exactly what these files hold. Comments are replaced by
 * spaces so error positions from `JSON.parse` still point at the right line.
 *
 * @param {string} text - The file contents.
 * @returns {unknown} The parsed value.
 * @throws {SyntaxError} If what remains is not JSON.
 */
export function parseJsonc(text) {
	let output = '';
	let index = 0;

	while (index < text.length) {
		const character = text.charAt(index);
		const next = text.charAt(index + 1);

		if (character === '"') {
			const start = index;

			index += 1;
			while (index < text.length && text.charAt(index) !== '"') {
				index += text.charAt(index) === '\\' ? 2 : 1;
			}
			index += 1;
			output += text.slice(start, index);
		} else if (character === '/' && next === '/') {
			while (index < text.length && text.charAt(index) !== '\n') {
				output += ' ';
				index += 1;
			}
		} else if (character === '/' && next === '*') {
			const end = text.indexOf('*/', index + 2);
			const stop = end === -1 ? text.length : end + 2;

			output += text.slice(index, stop).replace(/[^\n]/gu, ' ');
			index = stop;
		} else {
			output += character;
			index += 1;
		}
	}

	return JSON.parse(output.replace(/,(\s*[}\]])/gu, '$1'));
}

/**
 * @typedef {object} WranglerConfig
 * @property {string} name - The Worker's name.
 * @property {string} [compatibility_date] - The runtime compatibility date.
 * @property {string[]} [compatibility_flags] - Runtime compatibility flags.
 * @property {string} [main] - The Worker script, relative to the config file.
 * @property {{ directory?: string, binding?: string, not_found_handling?: string, run_worker_first?: boolean | string[] }} [assets] - Static assets.
 * @property {{ pattern: string, custom_domain?: boolean }[]} [routes] - Routes and custom domains.
 * @property {boolean} [workers_dev] - Whether the `*.workers.dev` URL is enabled.
 * @property {boolean} [preview_urls] - Whether version preview URLs are enabled.
 */

/**
 * @typedef {object} DeployTarget
 * @property {string} packageDirectory - The package's directory under `packages/`, e.g. `examples-vue`.
 * @property {string} packageName - Its `package.json` name, which turbo and pnpm filter on.
 * @property {string} configPath - The Wrangler config, relative to the repository root (POSIX separators).
 * @property {string} assetsDirectory - The static-assets directory, relative to the repository root.
 * @property {string[]} hosts - Every custom-domain host the Worker is served on.
 * @property {WranglerConfig} config - The parsed config.
 */

/**
 * Every package with a `wrangler.jsonc`, in directory order.
 *
 * @param {string} [repoRoot] - The repository root. Defaults to this checkout's.
 * @returns {DeployTarget[]} One target per deployable package.
 * @throws {Error} If a config has no `assets.directory` — every site here serves static assets.
 */
export function listDeployTargets(repoRoot = REPO_ROOT) {
	const packagesDirectory = join(repoRoot, 'packages');

	return readdirSync(packagesDirectory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(packagesDirectory, entry.name, WRANGLER_CONFIG_FILE)))
		.map((entry) => entry.name)
		.sort()
		.map((packageDirectory) => {
			const packagePath = join(packagesDirectory, packageDirectory);
			const configFile = join(packagePath, WRANGLER_CONFIG_FILE);
			const config = /** @type {WranglerConfig} */ (parseJsonc(readFileSync(configFile, 'utf8')));
			const manifest = /** @type {{ name: string }} */ (JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8')));
			const assets = config.assets?.directory;

			if (assets === undefined) {
				throw new Error(`packages/${packageDirectory}/${WRANGLER_CONFIG_FILE} has no assets.directory`);
			}

			return {
				assetsDirectory: toPosix(relative(repoRoot, join(packagePath, assets))),
				config,
				configPath: toPosix(relative(repoRoot, configFile)),
				hosts: (config.routes ?? []).filter((route) => route.custom_domain === true).map((route) => route.pattern),
				packageDirectory,
				packageName: manifest.name,
			};
		});
}

/**
 * A path with POSIX separators, so the same value works in a GitHub Actions `run:` step on any runner.
 *
 * @param {string} path - A relative path.
 * @returns {string} The path with `/` separators.
 */
function toPosix(path) {
	return path.split(/[\\/]/u).join(posix.sep);
}
