/**
 * Packages that pin each other's exact version are installed at the versions they pin.
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

/** A peer range that admits exactly one version. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u;

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

const PINS = resolvedPins(readFileSync(resolve(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8'));

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
