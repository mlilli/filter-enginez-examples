/**
 * Unit tests for the pure CLI argument parser.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { parseCliArgs } from './cliArgs.js';

describe('parseCliArgs', () => {
	it('defaults to books, limit 10, built-in config', () => {
		const parse = parseCliArgs([]);

		expect(parse).toEqual({ kind: 'run', options: { configPath: undefined, countOnly: false, dataset: 'books', limit: 10 }});
	});

	it('parses long flags', () => {
		const parse = parseCliArgs(['--dataset', 'wine', '--config', 'c.json', '--limit', '5']);

		expect(parse).toEqual({ kind: 'run', options: { configPath: 'c.json', countOnly: false, dataset: 'wine', limit: 5 }});
	});

	it('parses short flags + --count-only', () => {
		const parse = parseCliArgs(['-d', 'books', '-n', '-1', '--count-only']);

		expect(parse).toEqual({ kind: 'run', options: { configPath: undefined, countOnly: true, dataset: 'books', limit: -1 }});
	});

	it('recognizes --list and --help', () => {
		expect(parseCliArgs(['--list'])).toEqual({ kind: 'list' });
		expect(parseCliArgs(['-h'])).toEqual({ kind: 'help' });
	});

	it('errors on a missing flag value', () => {
		expect(parseCliArgs(['--dataset']).kind).toBe('error');
		expect(parseCliArgs(['--limit']).kind).toBe('error');
	});

	it('errors on a non-integer limit and unknown args', () => {
		expect(parseCliArgs(['--limit', 'abc']).kind).toBe('error');
		expect(parseCliArgs(['--unknown']).kind).toBe('error');
	});

	it('accepts the long --help as well as -h', () => {
		// Covers the long form alongside `-h`. A switch that fell through or mis-cased it would leave
		// `--help` parsed as an unknown argument — the least forgiving thing a CLI can do to someone
		// who is, by definition, already asking how to use it.
		expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
	});

	it('errors when --config is given without a path', () => {
		// The --config arm of the missing-value check (--dataset and --limit have their own cases).
		const parse = parseCliArgs(['--config']);

		expect(parse).toEqual({ kind: 'error', message: '--config requires a file path' });
	});

	it('names the offending argument in the unknown-argument error', () => {
		// The message is the whole value of this branch; asserting only `kind === 'error'` would let a
		// regression that dropped the argument name through.
		expect(parseCliArgs(['--nope'])).toEqual({ kind: 'error', message: 'Unknown argument: --nope' });
	});

	it('reports the FIRST unknown argument rather than the last', () => {
		expect(parseCliArgs(['--first-bad', '--second-bad'])).toMatchObject({ message: 'Unknown argument: --first-bad' });
	});
});
