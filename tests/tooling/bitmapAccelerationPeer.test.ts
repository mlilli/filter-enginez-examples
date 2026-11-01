/**
 * Every package that turns on bitmap acceleration installs `roaring-wasm`, and no other package does.
 *
 * @remarks
 * ### Why a package has to declare it
 *
 * `roaring-wasm` is an optional peer dependency of `@filter-enginez/core`: core loads it with an
 * `import()` inside `initializeBitmapAcceleration()`, and installing core does not install it. pnpm
 * links an optional peer into core only for a package that declares it, so an app that calls the
 * initializer, or bundles shared code that does, gets the library only by naming it in its own
 * manifest. Without it, every way the failure shows is quiet:
 *
 * - a Vite or Angular production build substitutes an empty module for the missing import and
 *   succeeds, and the initializer then rejects with `MODE_ACCELERATION_PEER_MISSING` in the browser;
 * - the SvelteKit server catches that rejection by design (a Cloudflare Worker cannot compile the
 *   WebAssembly) and filters on the predicate path, with one log line;
 * - and while any other package in the workspace declares it, pnpm may still resolve the peer for
 *   everyone, so the gap stays invisible until that other package drops it.
 *
 * ### What this checks
 *
 * A package NEEDS the library when its own source calls `initializeBitmapAcceleration()`, or when it
 * imports a subpath of `@filter-enginez/examples-shared` whose module graph reaches such a call (the
 * shared boots, the wine worker, and the how-it-works benchmark, which initializes bitmaps before it
 * measures one). Each such package declares `roaring-wasm` in the same manifest field as
 * `@filter-enginez/core`, with one version range everywhere. A package that names no core of its own,
 * because it reaches the engine only through an `examples-shared` subpath that its build bundles (the
 * landing site), declares it in `dependencies`, the field examples-shared declares core in. A package
 * that does not need it does not declare it either — the documentation site runs the engine without
 * bitmaps, and a stale declaration is a claim nobody checks.
 *
 * The subpath graph is followed through static imports, re-exports, `import()`, Vite `?worker`
 * imports and `new URL('./x', import.meta.url)`, so a call that only a lazy route or a worker reaches
 * still counts. It is an import graph, not a bundle: a package that imports such a subpath but whose
 * bundle tree-shakes the initializer away would be over-required, which the stale-declaration case
 * reports by name.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** The optional peer dependency every bitmap-accelerated package installs. */
const PEER_NAME = 'roaring-wasm';

/** The engine package that loads it. */
const CORE_NAME = '@filter-enginez/core';

/** The workspace package whose subpaths carry the shared boots. */
const SHARED_NAME = '@filter-enginez/examples-shared';

/** Source extensions a module of this repository can be written in. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.svelte', '.vue'] as const;

/** A call to the initializer, once comments and string literals are gone. */
const INITIALIZER_CALL = /\binitializeBitmapAcceleration\(/u;

/**
 * Comments and string literals: a call written in a docblock, or quoted in documentation content
 * (`apiContent.ts` lists the initializer's signature), is no call.
 */
const COMMENT_OR_STRING = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/gu;

/** Every module specifier a file names: static imports and re-exports, `import()`, and worker URLs. */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
	/^\s*(?:import|export)\s[^'";]*?\bfrom\s+['"]([^'"]+)['"]/gmu,
	/^\s*import\s+['"]([^'"]+)['"]/gmu,
	/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
	/\bnew\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gu,
];

/** The manifest fields a package can name a dependency in. */
type DependencyField = 'dependencies' | 'devDependencies';

/** What this guard reads of a `package.json`. */
interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly exports?: Readonly<Record<string, unknown>>;
	readonly name: string;
}

/** One workspace package. */
interface WorkspacePackage {
	/** Its directory, relative to the repo root (`packages/examples-vue`). */
	readonly directory: string;
	readonly manifest: Manifest;
}

/** Every workspace package under `packages/`. */
function workspacePackages(): readonly WorkspacePackage[] {
	return readdirSync(resolve(REPO_ROOT, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(resolve(REPO_ROOT, 'packages', entry.name, 'package.json')))
		.map((entry) => ({
			directory: `packages/${entry.name}`,
			manifest: JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', entry.name, 'package.json'), 'utf8')) as Manifest,
		}));
}

/**
 * The non-test source files of one package.
 *
 * @param directory - The package directory, relative to the repo root.
 * @returns Repo-relative paths.
 */
function packageSources(directory: string): readonly string[] {
	return walkRepoFiles(resolve(REPO_ROOT, directory))
		.filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)))
		.filter((path) => !/\.(?:test|spec)\.|[/\\]test-support[/\\]|\.d\.ts$/u.test(path));
}

/**
 * Every module specifier a source file names.
 *
 * @param path - Repo-relative path.
 * @returns The specifiers, query strings (`?worker`) removed.
 */
function specifiersOf(path: string): readonly string[] {
	const text = readFileSync(resolve(REPO_ROOT, path), 'utf8');

	return SPECIFIER_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => String(match[1]).replace(/\?.*$/u, '')));
}

/**
 * Whether a source file calls the initializer.
 *
 * @param path - Repo-relative path.
 * @returns `true` when its code, outside comments and strings, calls `initializeBitmapAcceleration(`.
 */
function callsInitializer(path: string): boolean {
	return INITIALIZER_CALL.test(readFileSync(resolve(REPO_ROOT, path), 'utf8').replace(COMMENT_OR_STRING, ''));
}

/**
 * Resolve a relative specifier the way the bundlers here do: a `.js` written for a `.ts` file, an
 * extensionless path, or a directory with an `index`.
 *
 * @param fromPath - The importing file, repo-relative.
 * @param specifier - A `./` or `../` specifier.
 * @returns The repo-relative file, or `undefined` for one outside the source tree (a stylesheet, JSON).
 */
function resolveRelative(fromPath: string, specifier: string): string | undefined {
	const base = resolve(REPO_ROOT, dirname(fromPath), specifier);
	const stem = base.replace(/\.js$/u, '');
	const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`))];
	const found = candidates.find((candidate) => SOURCE_EXTENSIONS.some((extension) => candidate.endsWith(extension)) && existsSync(candidate));

	return found === undefined ? undefined : found.slice(REPO_ROOT.length + 1);
}

/**
 * The entry file of each `examples-shared` subpath, by specifier (`@filter-enginez/examples-shared/wine-core`).
 *
 * @param shared - The shared package.
 * @returns Specifier → repo-relative entry file.
 */
function sharedSubpathEntries(shared: WorkspacePackage): ReadonlyMap<string, string> {
	return new Map(
		Object.entries(shared.manifest.exports ?? {})
			.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
			.map(([subpath, target]) => [`${SHARED_NAME}${subpath.slice(1)}`, `${shared.directory}/${target.replace(/^\.\//u, '')}`]),
	);
}

/**
 * Whether a module graph, followed from `entry`, reaches a file that calls the initializer.
 *
 * @param entry - The repo-relative entry file.
 * @param subpathEntries - Shared specifiers → entry files, for imports between shared subpaths.
 * @returns `true` when some reachable file calls it.
 */
function reachesInitializer(entry: string, subpathEntries: ReadonlyMap<string, string>): boolean {
	const seen = new Set<string>();
	const pending = [entry];

	for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
		if (seen.has(path)) {
			continue;
		}
		seen.add(path);
		if (callsInitializer(path)) {
			return true;
		}
		for (const specifier of specifiersOf(path)) {
			const next = specifier.startsWith('.') ? resolveRelative(path, specifier) : subpathEntries.get(specifier);

			if (next !== undefined) {
				pending.push(next);
			}
		}
	}

	return false;
}

/**
 * Which field of a manifest names a dependency.
 *
 * @param manifest - The manifest.
 * @param name - The dependency.
 * @returns The field, or `undefined` when neither does.
 */
function fieldNaming(manifest: Manifest, name: string): DependencyField | undefined {
	if (manifest.dependencies?.[name] !== undefined) {
		return 'dependencies';
	}

	return manifest.devDependencies?.[name] === undefined ? undefined : 'devDependencies';
}

describe('roaring-wasm is installed by exactly the packages that enable bitmap acceleration', () => {
	const packages = workspacePackages();
	const shared = packages.find((candidate) => candidate.manifest.name === SHARED_NAME);
	const subpathEntries = shared === undefined ? new Map<string, string>() : sharedSubpathEntries(shared);
	const reachingSubpaths = new Set([...subpathEntries].filter(([, entry]) => reachesInitializer(entry, subpathEntries)).map(([specifier]) => specifier));

	/**
	 * Why a package needs the library, or `undefined` when it does not.
	 *
	 * @param candidate - The package.
	 * @returns A reason naming the file and what it does.
	 */
	const reasonToInstall = (candidate: WorkspacePackage): string | undefined => {
		const sources = packageSources(candidate.directory);
		const caller = sources.find((path) => callsInitializer(path));

		if (caller !== undefined) {
			return `${caller} calls initializeBitmapAcceleration()`;
		}
		for (const path of sources) {
			const specifier = specifiersOf(path).find((named) => reachingSubpaths.has(named));

			if (specifier !== undefined) {
				return `${path} imports ${specifier}, whose module graph calls initializeBitmapAcceleration()`;
			}
		}

		return undefined;
	};

	const verdicts = packages.map((candidate) => ({ candidate, reason: reasonToInstall(candidate) }));

	it('finds the shared package, its subpaths, and subpaths that reach the initializer', () => {
		expect(shared, `${SHARED_NAME} must be a workspace package`).toBeDefined();
		expect(subpathEntries.size).toBeGreaterThan(0);
		expect(reachingSubpaths.size, 'no examples-shared subpath reaches initializeBitmapAcceleration() — the graph walk found nothing').toBeGreaterThan(0);
		expect(reachingSubpaths.has(`${SHARED_NAME}/wine-worker`), 'the wine worker initializes the bitmaps in its own scope').toBe(true);
		expect(reachingSubpaths.has(`${SHARED_NAME}/how-it-works`), 'the how-it-works benchmark initializes the bitmaps before it measures').toBe(true);
	});

	it('every package that needs the library declares it beside core, or in dependencies when core comes through examples-shared', () => {
		const needing = verdicts.filter(({ reason }) => reason !== undefined);

		expect(needing.length).toBeGreaterThan(0);
		expect(
			needing.map(({ candidate }) => candidate.directory),
			'the landing site measures bitmaps in its how-it-works benchmark',
		).toContain('packages/site');
		for (const { candidate, reason } of needing) {
			const coreField = fieldNaming(candidate.manifest, CORE_NAME);
			const sharedField = fieldNaming(candidate.manifest, SHARED_NAME);
			const expectedField = coreField ?? (sharedField === undefined ? undefined : 'dependencies');
			const where = coreField === undefined ? `"dependencies", since it reaches ${CORE_NAME} through ${SHARED_NAME}` : `"${coreField}", beside ${CORE_NAME}`;

			expect(expectedField, `${candidate.directory} enables bitmaps (${String(reason)}) but declares neither ${CORE_NAME} nor ${SHARED_NAME}`).toBeDefined();
			expect(fieldNaming(candidate.manifest, PEER_NAME), `${candidate.directory}/package.json must declare ${PEER_NAME} in ${where}: ${String(reason)}`).toBe(
				expectedField,
			);
		}
	});

	it('no package that does not need the library declares it', () => {
		const stale = verdicts.filter(({ candidate, reason }) => reason === undefined && fieldNaming(candidate.manifest, PEER_NAME) !== undefined);

		expect(
			stale.map(({ candidate }) => candidate.directory),
			`these declare ${PEER_NAME} but neither call initializeBitmapAcceleration() nor import a subpath that does; remove the declaration`,
		).toEqual([]);
	});

	it('every declaration names the same version range', () => {
		const ranges = new Set(
			packages.flatMap(({ manifest }) => [manifest.dependencies?.[PEER_NAME], manifest.devDependencies?.[PEER_NAME]].filter((range) => range !== undefined)),
		);

		expect([...ranges]).toHaveLength(1);
	});
});
