#!/usr/bin/env node
/**
 * `sync-engine-versions` — make every `@filter-enginez/*` engine reference here name the version the sibling
 * engine checkout is at.
 *
 *     node scripts/sync-engine-versions.mjs
 *
 * @remarks
 * The apps consume the engine as tarballs packed from `../filter-enginez`, and a tarball is named for the
 * package's version (`filter-enginez-core-0.0.2.tgz`). Each engine release therefore moves two things here
 * together: every manifest's `@filter-enginez/<package>` version, and the matching `file:` override in
 * `pnpm-workspace.yaml`. `scripts/pin-engine-ref.sh` runs this right after recording the pin, so a pin can
 * never point at tarballs the manifests and overrides do not name. `tests/tooling/overrideUpperBounds.test.ts`
 * checks that manifests and overrides agree.
 *
 * Only engine packages are rewritten (those under `../filter-enginez/packages/`); this repository's own
 * private `@filter-enginez/*` packages keep `workspace:` specs. Exits non-zero if the engine checkout is
 * missing, and reports each file it changed.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_PACKAGES_DIRECTORY = resolve(REPOSITORY_ROOT, '../filter-enginez/packages');

if (!existsSync(ENGINE_PACKAGES_DIRECTORY)) {
	console.error(`✗ sync-engine-versions: ${ENGINE_PACKAGES_DIRECTORY} does not exist — clone the engine beside this repo.`);
	process.exit(1);
}

/** Engine package short name (`core`) → its current version, read from the engine checkout. */
const engineVersionByShortName = new Map(
	readdirSync(ENGINE_PACKAGES_DIRECTORY, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(ENGINE_PACKAGES_DIRECTORY, entry.name, 'package.json')))
		.map((entry) => {
			const manifest = JSON.parse(readFileSync(join(ENGINE_PACKAGES_DIRECTORY, entry.name, 'package.json'), 'utf8'));

			return [manifest.name.replace('@filter-enginez/', ''), manifest.version];
		}),
);

const engineNamePattern = [...engineVersionByShortName.keys()].join('|');
const manifestDependencyPattern = new RegExp(`("@filter-enginez/(${engineNamePattern})": )"\\d+\\.\\d+\\.\\d+"`, 'gu');
const overrideTarballPattern = new RegExp(`(filter-enginez-(${engineNamePattern}))-\\d+\\.\\d+\\.\\d+\\.tgz`, 'gu');

/**
 * Rewrite one file with `pattern`, replacing each match's version with the engine's.
 *
 * @param {string} relativePath - Path from the repository root.
 * @param {RegExp} pattern - Captures (1) the text before the version and (2) the engine short name.
 * @param {(prefix: string, version: string) => string} format - Builds the replacement.
 */
function rewrite(relativePath, pattern, format) {
	const path = resolve(REPOSITORY_ROOT, relativePath);
	const before = readFileSync(path, 'utf8');
	const after = before.replace(pattern, (_match, prefix, shortName) => format(prefix, engineVersionByShortName.get(shortName)));

	if (after !== before) {
		writeFileSync(path, after);
		console.log(`→ sync-engine-versions: updated ${relativePath}`);
	}
}

const manifestPaths = [
	'package.json',
	...readdirSync(resolve(REPOSITORY_ROOT, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(resolve(REPOSITORY_ROOT, 'packages', entry.name, 'package.json')))
		.map((entry) => `packages/${entry.name}/package.json`),
];

for (const manifestPath of manifestPaths) {
	rewrite(manifestPath, manifestDependencyPattern, (prefix, version) => `${prefix}"${version}"`);
}
rewrite('pnpm-workspace.yaml', overrideTarballPattern, (prefix, version) => `${prefix}-${version}.tgz`);

console.log(`✓ sync-engine-versions: engine references match ../filter-enginez (${[...new Set(engineVersionByShortName.values())].join(', ')})`);
