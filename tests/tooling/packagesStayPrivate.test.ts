/**
 * Nothing in this repository can be published to npm: the root and every package are `private`.
 *
 * @remarks
 * ## Why this needs a guard in a repository that publishes nothing
 *
 * The published packages live in the engine repository. Everything here — six demo apps, the docs
 * site, the server demo, and the UI and brand packages they share — is meant to be read, run and
 * forked, never installed from the registry. `private: true` is the ONLY thing that keeps it there:
 * `pnpm publish -r` and `changeset publish` publish every workspace package that does not carry it.
 *
 * 🔴 **And the cost of getting it wrong once is permanent.** npm's unpublish policy is narrow — 72
 * hours, and refused outright once anything depends on the package — so a demo app published by
 * accident is public approximately forever, under a name in the `@filter-enginez` scope that the real
 * packages share.
 *
 * ## Why derived rather than listed
 *
 * A literal list of package names is the failure mode: it covers the packages somebody remembered to
 * write down, and leaves the rest unguarded while the case reads as complete. Every manifest is found
 * from `packages/*` instead, so a new package is covered the day it appears.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The manifest fields this guard reads. */
interface Manifest {
	readonly private?: boolean;
	readonly publishConfig?: Readonly<Record<string, unknown>>;
}

/**
 * Every package directory under `packages/` that holds a manifest.
 *
 * @returns Directory names, sorted.
 */
function packageDirectories(): readonly string[] {
	return readdirSync(resolve(REPO_ROOT, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(resolve(REPO_ROOT, 'packages', entry.name, 'package.json')))
		.map((entry) => entry.name)
		.sort();
}

/**
 * Read one manifest.
 *
 * @param path - Repo-relative path to a `package.json`.
 * @returns The fields this guard reads.
 */
function readManifest(path: string): Manifest {
	return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as Manifest;
}

/** The root manifest plus every package manifest, as repo-relative paths. */
const MANIFESTS = ['package.json', ...packageDirectories().map((name) => `packages/${name}/package.json`)];

describe('every package stays private', () => {
	it('found the packages, so the cases below have subjects', () => {
		// Vacuity guard. A `readdirSync` that returned nothing would leave the root as the only subject
		// and the cases below passing over it alone. Compared against the directory listing itself, so
		// a directory whose manifest the filter skipped is reported rather than silently exempted.
		const directories = readdirSync(resolve(REPO_ROOT, 'packages'), { withFileTypes: true }).filter((entry) =>
			entry.isDirectory(),
		);

		expect(directories.length, 'no directories under packages/ — has it moved?').toBeGreaterThan(0);
		expect(packageDirectories(), 'a directory under packages/ has no package.json').toHaveLength(
			directories.length,
		);
	});

	it.each(MANIFESTS)('%s is private', (path) => {
		expect(
			readManifest(path).private,
			`${path} is not private, so \`pnpm publish -r\` would push it to npm — where removal is `
			+ 'restricted to 72 hours and refused once anything depends on it. Restore `"private": true`.',
		).toBe(true);
	});

	it.each(MANIFESTS)('%s carries no publishConfig', (path) => {
		// A `publishConfig` is preparation for publishing, and in this repository that is the finding:
		// it means someone is one deleted `private` away from shipping the package.
		expect(readManifest(path).publishConfig, `${path} has a publishConfig`).toBeUndefined();
	});
});
