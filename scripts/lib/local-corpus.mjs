/**
 * `local-corpus` — find and delete the local-only real wine corpus inside a build-output directory.
 *
 * @remarks
 * Shared by the `strip-local-corpus.mjs` CLI (the last step of every app build) and the SvelteKit
 * app's adapter wrapper, which strips the corpus BEFORE `adapter-node` copies and precompresses the
 * client assets. See `strip-local-corpus.mjs` for why the corpus must never ship.
 *
 * @packageDocumentation
 */

import { lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** File names that belong to the local-only corpus or its raw source. */
export const LOCAL_ONLY_FILE = /^(?:data-real-|winemag-data)/u;

/**
 * Delete every local-only corpus file under `directory`, recursively, without following symlinked
 * directories.
 *
 * @param {string} directory - An absolute directory that exists.
 * @returns {string[]} The paths removed.
 */
export function stripLocalCorpus(directory) {
	const removed = [];

	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);

		if (LOCAL_ONLY_FILE.test(entry.name) && !lstatSync(entryPath).isDirectory()) {
			unlinkSync(entryPath);
			removed.push(entryPath);
		} else if (entry.isDirectory()) {
			removed.push(...stripLocalCorpus(entryPath));
		}
	}

	return removed;
}
