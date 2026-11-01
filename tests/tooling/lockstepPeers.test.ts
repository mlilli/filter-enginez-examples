/**
 * Packages that must share one version are installed at it.
 *
 * @remarks
 * ## Why this exists
 *
 * Some packages ship as families whose members name each other's EXACT version as a peer: `@angular/router` 22.2.3
 * requires `@angular/core`, `@angular/common` and `@angular/platform-browser` 22.2.3, and `@vitest/ui` 4.1.11
 * requires `vitest` 4.1.11. pnpm reports an unmet peer as a warning, not an error, so an install where one member
 * moved without the others succeeds, and so does every gate that does not happen to load both halves together.
 *
 * Here Dependabot updates GitHub Actions only (it cannot resolve the engine tarballs this workspace installs; see
 * `.github/dependabot.yml`), so npm dependencies move by hand, and a hand bump that names some members of a family
 * and not the others produces exactly that install. This checks the lockfile it leaves: wherever a package pins a
 * peer exactly and that peer is installed beside it, the installed version is the pinned one. The pins come from the
 * lockfile, so a family is covered from the day it is installed, without a list to keep.
 *
 * Some families are lockstep at RUNTIME while their peer ranges allow more: `react-dom` declares `react` as a caret
 * range, then throws at load ("Incompatible React versions") unless `react` is its own exact version. The lockfile
 * cannot reveal those, so they are listed ({@link RUNTIME_LOCKSTEP}) and checked twice: each peer is installed at its
 * dependent's own version, and a workspace package that depends on the dependent (in `dependencies` or
 * `devDependencies`) depends on the peer there too, so a bump of the package's own manifest names both. A peer that
 * pnpm merely auto-installs stays where it is while its twin moves.
 *
 * Read as TEXT, like the other guards over this file. `pnpm-lock.yaml` is a two-document YAML stream (pnpm's own
 * environment first, then the workspace), each with its own `packages` and `snapshots`; every section of both
 * documents is read.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/** One lockfile entry: its key as written, quotes removed, and its indented body. */
type LockfileEntry = readonly [key: string, body: string];

/** An exactly pinned peer, installed beside the package that pins it. */
interface ResolvedPin {
	/** The installed version of the peer, peer suffix removed. */
	readonly installed: string;
	/** The peer's package name. */
	readonly peer: string;
	/** The version the dependent requires. */
	readonly required: string;
	/** The snapshot key of the dependent. */
	readonly snapshot: string;
}

/** The dependency kinds a workspace manifest declares. */
interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

/** A peer range that admits exactly one version. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u;

/**
 * Families whose dependent requires the peer at its OWN exact version at runtime, though its peer range admits more.
 * As `[dependent, peer]`.
 */
const RUNTIME_LOCKSTEP: readonly (readonly [dependent: string, peer: string])[] = [['react-dom', 'react']];

/**
 * Remove one pair of matching quotes.
 *
 * @param text - A YAML scalar as written.
 * @returns The scalar without its quotes.
 */
function unquote(text: string): string {
	return text.trim().replace(/^(?<quote>['"])(?<inner>.*)\k<quote>$/u, '$<inner>');
}

/**
 * The bodies of every top-level section with one key, across every document of the stream.
 *
 * @param lockfile - The text of `pnpm-lock.yaml`.
 * @param key - A top-level key, such as `snapshots`.
 * @returns Each section's body, in file order.
 */
function sections(lockfile: string, key: string): readonly string[] {
	return [...lockfile.matchAll(new RegExp(String.raw`^${key}:[ \t]*\n(?<body>(?:(?:[ \t]+.*)?\n)*)`, 'gmu'))]
		.map((match) => match.groups?.['body'] ?? '');
}

/**
 * The entries of one `packages` or `snapshots` section.
 *
 * @param body - The section's body.
 * @returns Each entry's key and its indented lines.
 */
function entries(body: string): readonly LockfileEntry[] {
	return [...body.matchAll(/^ {2}(?<key>\S[^\n]*?):(?:[ \t]+\{\})?[ \t]*\n(?<lines>(?: {4}.*\n)*)/gmu)]
		.map((match) => [unquote(match.groups?.['key'] ?? ''), match.groups?.['lines'] ?? ''] as const);
}

/**
 * The `name: value` pairs of one mapping inside an entry, such as its `peerDependencies`.
 *
 * @param lines - The entry's body.
 * @param key - The mapping's key.
 * @returns Each pair with the name's quotes removed; empty when the entry has no such mapping.
 */
function mapping(lines: string, key: string): readonly (readonly [name: string, value: string])[] {
	const items = new RegExp(String.raw`^ {4}${key}:\n(?<items>(?: {6}.*\n)*)`, 'mu').exec(lines)?.groups?.['items'] ?? '';

	return [...items.matchAll(/^ {6}(?<name>\S[^\n]*?): (?<value>\S.*)$/gmu)]
		.map((match) => [unquote(match.groups?.['name'] ?? ''), (match.groups?.['value'] ?? '').trim()] as const);
}

/**
 * Every exactly pinned peer that is installed beside a package pinning it.
 *
 * @param lockfile - The text of `pnpm-lock.yaml`.
 * @returns One record per snapshot and pinned peer.
 */
function resolvedPins(lockfile: string): readonly ResolvedPin[] {
	const snapshots = sections(lockfile, 'snapshots').flatMap(entries);

	return sections(lockfile, 'packages').flatMap(entries).flatMap(([dependent, lines]) =>
		mapping(lines, 'peerDependencies')
			.filter(([, range]) => EXACT_VERSION.test(range))
			.flatMap(([peer, required]) =>
				snapshots
					.filter(([snapshot]) => snapshot === dependent || snapshot.startsWith(`${dependent}(`))
					.flatMap(([snapshot, body]) => {
						const installed = [...mapping(body, 'dependencies'), ...mapping(body, 'optionalDependencies')]
							.find(([name]) => name === peer)?.[1];

						return installed === undefined ? [] : [{ installed: installed.replace(/\(.*$/u, ''), peer, required, snapshot }];
					})));
}

/**
 * The package name in a lockfile key.
 *
 * @param key - `name@version`, optionally followed by a peer suffix in parentheses.
 * @returns The name.
 */
function packageName(key: string): string {
	const withoutPeers = key.replace(/\(.*$/u, '');

	return withoutPeers.slice(0, withoutPeers.lastIndexOf('@'));
}

/**
 * Every runtime-lockstep peer installed beside its dependent, required at the dependent's own version.
 *
 * @param lockfile - The text of `pnpm-lock.yaml`.
 * @param families - The `[dependent, peer]` pairs to check.
 * @returns One record per snapshot of a dependent that has the peer installed.
 */
function runtimePins(lockfile: string, families: readonly (readonly [string, string])[]): readonly ResolvedPin[] {
	return sections(lockfile, 'snapshots').flatMap(entries).flatMap(([snapshot, body]) => {
		const withoutPeers = snapshot.replace(/\(.*$/u, '');
		const required = withoutPeers.slice(withoutPeers.lastIndexOf('@') + 1);

		return families.filter(([dependent]) => packageName(snapshot) === dependent).flatMap(([, peer]) => {
			const installed = mapping(body, 'dependencies').find(([name]) => name === peer)?.[1];

			return installed === undefined ? [] : [{ installed: installed.replace(/\(.*$/u, ''), peer, required, snapshot }];
		});
	});
}

/**
 * The workspace packages, as the lockfile's importers name them.
 *
 * @param lockfile - The text of `pnpm-lock.yaml`.
 * @returns Each importer's directory relative to the repo root (`.` for the root), once.
 */
function importerDirectories(lockfile: string): readonly string[] {
	return [...new Set(sections(lockfile, 'importers').flatMap((body) =>
		[...body.matchAll(/^ {2}(?<directory>\S[^\n]*?):$/gmu)].map((match) => unquote(match.groups?.['directory'] ?? ''))))];
}

/**
 * The manifests that list a runtime-lockstep dependent outside `peerDependencies`, without its peer beside it.
 *
 * @param manifests - Each workspace manifest, by directory.
 * @param families - The `[dependent, peer]` pairs to check.
 * @returns One line per manifest and family that misses the peer.
 */
function manifestsMissingPeer(
	manifests: Readonly<Record<string, Manifest>>,
	families: readonly (readonly [string, string])[],
): readonly string[] {
	return Object.entries(manifests).flatMap(([directory, manifest]) => {
		const bumped = { ...manifest.dependencies, ...manifest.devDependencies };

		return families.filter(([dependent, peer]) => dependent in bumped && !(peer in bumped))
			.map(([dependent, peer]) => `${directory}/package.json lists ${dependent} but not ${peer}`);
	});
}

const LOCKFILE = readFileSync(resolve(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8');
const PINS = resolvedPins(LOCKFILE);
const RUNTIME_PINS = runtimePins(LOCKFILE, RUNTIME_LOCKSTEP);
const MANIFESTS: Readonly<Record<string, Manifest>> = Object.fromEntries(importerDirectories(LOCKFILE)
	.map((directory) => [directory, JSON.parse(readFileSync(resolve(REPO_ROOT, directory, 'package.json'), 'utf8')) as Manifest]));

describe('exactly pinned peers in pnpm-lock.yaml', () => {
	it('finds exactly pinned peers installed beside their dependents, Angular among them', () => {
		// The vacuity check: with no pins parsed, the case below would pass on any lockfile.
		expect(PINS.map((pin) => pin.peer)).toEqual(expect.arrayContaining(['@angular/core']));
	});

	it('installs every exactly pinned peer at the pinned version', () => {
		expect(
			PINS.filter((pin) => pin.installed !== pin.required)
				.map((pin) => `${pin.snapshot} requires ${pin.peer} ${pin.required}, installed ${pin.installed}`),
			'a family that pins each other exactly moved in halves. Bump every member to the same version in one change.',
		).toEqual([]);
	});

	it('reports a peer installed at another version — the control for the case above', () => {
		// Without it, a parser that never paired a pin with a snapshot would pass the case above on any input.
		const lockfile = [
			'packages:',
			'',
			"  '@f/a@1.0.1':",
			'    resolution: {integrity: x}',
			'    peerDependencies:',
			"      '@f/b': 1.0.1",
			'      c: ^2.0.0',
			'',
			'snapshots:',
			'',
			"  '@f/a@1.0.1(@f/b@1.0.0)(c@2.1.0)':",
			'    dependencies:',
			"      '@f/b': 1.0.0(c@2.1.0)",
			'      c: 2.1.0',
			'',
			"  '@f/b@1.0.0': {}",
			'',
		].join('\n');

		expect(resolvedPins(lockfile)).toEqual([
			{ installed: '1.0.0', peer: '@f/b', required: '1.0.1', snapshot: '@f/a@1.0.1(@f/b@1.0.0)(c@2.1.0)' },
		]);
	});
});

describe('runtime-lockstep families', () => {
	it('finds every listed family installed, and the workspace manifests', () => {
		// The vacuity check: with no snapshot paired or no manifest read, the cases below would pass on any input.
		expect(RUNTIME_LOCKSTEP.filter(([dependent]) => !RUNTIME_PINS.some((pin) => packageName(pin.snapshot) === dependent)))
			.toEqual([]);
		expect(Object.keys(MANIFESTS)).toEqual(expect.arrayContaining(['.', 'packages/examples-react-plain', 'packages/react-ui']));
	});

	it('installs each peer at its dependent\'s own version', () => {
		expect(
			RUNTIME_PINS.filter((pin) => pin.installed !== pin.required)
				.map((pin) => `${pin.snapshot} needs ${pin.peer} ${pin.required} at runtime, installed ${pin.installed}`),
			'a runtime-lockstep family moved in halves. Bump every member to the same version in one change.',
		).toEqual([]);
	});

	it('lists each peer beside its dependent in every manifest', () => {
		expect(
			manifestsMissingPeer(MANIFESTS, RUNTIME_LOCKSTEP),
			'a peer that is only auto-installed stays behind while its twin moves. Add the peer to devDependencies at the '
			+ 'same range as the dependent.',
		).toEqual([]);
	});

	it('reports a peer at another version, and a manifest without the peer — the controls for the cases above', () => {
		// Without them, a parser that never paired a snapshot or never read a manifest would pass on any input.
		const lockfile = [
			'snapshots:',
			'',
			'  d@1.0.1(p@1.0.0):',
			'    dependencies:',
			'      p: 1.0.0',
			'      s: 0.1.0',
			'',
			'  d@2.0.0(p@2.0.0):',
			'    dependencies:',
			'      p: 2.0.0',
			'',
		].join('\n');

		expect(runtimePins(lockfile, [['d', 'p']]).filter((pin) => pin.installed !== pin.required)).toEqual([
			{ installed: '1.0.0', peer: 'p', required: '1.0.1', snapshot: 'd@1.0.1(p@1.0.0)' },
		]);
		expect(manifestsMissingPeer({
			'packages/both': { devDependencies: { d: '^1.0.1', p: '^1.0.1' }},
			'packages/peer-only': { devDependencies: { d: '^1.0.1' }, peerDependencies: { p: '^1.0.0' }},
		}, [['d', 'p']])).toEqual(['packages/peer-only/package.json lists d but not p']);
	});
});
