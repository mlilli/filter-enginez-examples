/**
 * Tests for config reading + light validation.
 *
 * @remarks
 * This module is the CLI's front door (`--config sample-configs/books.json`), so every one of its
 * error paths is something a user hits by making an ordinary mistake: a typo'd path, a trailing comma,
 * a config that is valid JSON but the wrong shape. Those messages are the entire product of this file,
 * so they are what the tests assert on.
 *
 * `parseConfig` is pure, so most cases need no filesystem at all. `readConfigFile` is exercised
 * against a real temp file rather than a mocked `node:fs`: the module is eight lines of I/O wrapping,
 * and mocking the very call under test would leave nothing behind worth asserting.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { parseConfig, readConfigFile } from './readConfig.js';

const tempDir = mkdtempSync(join(tmpdir(), 'fe-readconfig-'));

afterAll(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

/**
 * Write a file into the throwaway directory.
 *
 * @param name - File name within the temp directory.
 * @param contents - Exact bytes to write.
 * @returns The absolute path written.
 */
function writeTemp(name: string, contents: string): string {
	const path = join(tempDir, name);

	writeFileSync(path, contents, 'utf8');

	return path;
}

describe('parseConfig', () => {
	it('returns a config that has a rules array', () => {
		const config = parseConfig('{"rules":[{"id":"genre","type":"inSet"}]}');

		expect(config.rules).toHaveLength(1);
	});

	it('accepts an empty rules array — a neutral config is legal', () => {
		// Boundary worth pinning: "no rules" is a valid starting state, not an error. Rejecting it
		// would break the documented `gen:sample` round-trip and the /books-config neutral boot.
		expect(parseConfig('{"rules":[]}').rules).toEqual([]);
	});

	it('preserves sibling fields it does not validate', () => {
		// The zod validation in the engine's loadConfig is authoritative; this function must not
		// quietly drop anything on the way there.
		const config = parseConfig('{"rules":[],"expression":{"op":"and","children":[]},"mode":"expression"}');

		expect(config).toMatchObject({ mode: 'expression' });
	});

	it('rejects malformed JSON and includes the underlying reason', () => {
		// The trailing-comma case: the most common hand-edit mistake, and the one where the raw JSON
		// parser message ("Unexpected token …") is genuinely the useful part.
		expect(() => parseConfig('{"rules":[],}')).toThrow(/Config is not valid JSON:/);
	});

	it.each([
		['a JSON array', '[]'],
		['a bare string', '"hello"'],
		['a number', '42'],
		['null', 'null'],
		['an object with no rules key', '{}'],
		['an object whose rules is not an array', '{"rules":{}}'],
	])('rejects %s with the shape error', (_label, raw) => {
		// Each of these parses as JSON but is not a FilterEngineConfig. `null` earns its own case
		// because `typeof null === 'object'` — the classic way this guard gets written wrong.
		expect(() => parseConfig(raw)).toThrow(/must be a FilterEngineConfig object with a "rules" array/);
	});
});

describe('readConfigFile', () => {
	it('reads and parses a config from disk', () => {
		const path = writeTemp('valid.json', '{"rules":[{"id":"genre","type":"inSet"}]}');

		expect(readConfigFile(path).rules).toHaveLength(1);
	});

	it('names the offending path when the file cannot be read', () => {
		// The path has to appear in the message: "Cannot read config file" alone would leave a user
		// staring at a typo they cannot see.
		const missing = join(tempDir, 'does-not-exist.json');

		expect(() => readConfigFile(missing)).toThrow(`Cannot read config file: ${missing}`);
	});

	it('surfaces parse errors from a file that exists but is malformed', () => {
		// Distinct from the unreadable case: the file was found, so the error must describe the
		// CONTENTS rather than blaming the path.
		const path = writeTemp('malformed.json', '{"rules":[,}');

		expect(() => readConfigFile(path)).toThrow(/Config is not valid JSON:/);
		expect(() => readConfigFile(path)).not.toThrow(/Cannot read config file/);
	});
});
