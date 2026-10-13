/**
 * Read + light-validate a JSON `FilterEngineConfig` from disk. The engine's `loadConfig` does the
 * authoritative (zod) validation; this just yields a friendly error for the obvious mistakes.
 *
 * @packageDocumentation
 */

import { type FilterEngineConfig } from '@filter-enginez/core';
import { readFileSync } from 'node:fs';

/** Parse a config from a JSON string, with friendly errors. Pure (no I/O). */
export function parseConfig(raw: string): FilterEngineConfig {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`Config is not valid JSON: ${(error as Error).message}`);
	}

	if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { rules?: unknown }).rules)) {
		throw new Error('Config must be a FilterEngineConfig object with a "rules" array.');
	}

	return parsed as FilterEngineConfig;
}

/** Read + parse a config file. Throws a friendly error if the file is unreadable or malformed. */
export function readConfigFile(path: string): FilterEngineConfig {
	let raw: string;

	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		throw new Error(`Cannot read config file: ${path}`);
	}

	return parseConfig(raw);
}
