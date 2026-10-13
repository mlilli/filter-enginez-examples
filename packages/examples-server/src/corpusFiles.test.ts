/**
 * Unit tests for the corpus files (`corpusFiles.ts`) — above all, that each written file holds exactly
 * the bytes its route sends.
 *
 * @remarks
 * Deployed, an API app's `/api/corpus/<dataset>.json` is answered by the static file this module
 * writes, never by the Worker. Nothing at deploy time compares the two, so the comparison is made
 * here, byte for byte, for every registered dataset, against both the pure handler and the Worker
 * adapter that would otherwise have answered. Each test writes into its own temporary directory.
 *
 * @packageDocumentation
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { corpusFileName, corpusPath } from './corpusDocument.js';
import { corpusFileContents, findCorpusFileProblems, parseCorpusCliArgs, writeCorpusFiles } from './corpusFiles.js';
import { datasetIds } from './datasets.js';
import { handleRequest } from './requestHandler.js';
import { API_PATH_PREFIX, handleWorkerRequest } from './workerRequestHandler.js';

/** The temporary directory the current test writes into. */
let outputDirectory: string;

/**
 * Assert two byte sequences are identical, without asking Vitest to diff megabytes on failure.
 *
 * @param actual - The bytes under test.
 * @param expected - The bytes they must equal.
 * @param label - What is being compared, for the failure message.
 */
function expectSameBytes(actual: Buffer, expected: Buffer, label: string): void {
	expect(actual.equals(expected), `${label}: ${String(actual.byteLength)} bytes, expected ${String(expected.byteLength)} identical bytes`).toBe(true);
}

beforeEach(() => {
	outputDirectory = mkdtempSync(join(tmpdir(), 'examples-server-corpus-'));
});

afterEach(() => {
	rmSync(outputDirectory, { force: true, recursive: true });
});

describe('writeCorpusFiles', () => {
	it('writes one <dataset>.json per registered dataset, and nothing else', async () => {
		const written = await writeCorpusFiles(outputDirectory);

		expect(datasetIds().length).toBeGreaterThan(0);
		expect(written.map((file) => file.datasetId)).toEqual(datasetIds());
		expect(readdirSync(outputDirectory).sort()).toEqual(datasetIds().map((datasetId) => corpusFileName(datasetId)).sort());
		for (const file of written) {
			expect(file.path).toBe(join(outputDirectory, corpusFileName(file.datasetId)));
			expect(file.byteLength).toBe(readFileSync(file.path).byteLength);
		}
	});

	it('creates a missing output directory, nested', async () => {
		const nested = join(outputDirectory, 'dist', 'api', 'corpus');

		await writeCorpusFiles(nested);

		expect(await findCorpusFileProblems(nested)).toEqual([]);
	});

	it.each(datasetIds())('writes %s.json byte for byte as the handler’s GET /corpus/<dataset>.json body', async (datasetId) => {
		await writeCorpusFiles(outputDirectory);
		const response = await handleRequest('GET', corpusPath(datasetId), undefined);

		expect(response.status).toBe(200);
		expectSameBytes(readFileSync(join(outputDirectory, corpusFileName(datasetId))), Buffer.from(JSON.stringify(response.body)), corpusFileName(datasetId));
	});

	it.each(datasetIds())('writes %s.json byte for byte as the Worker would answer /api/corpus/<dataset>.json', async (datasetId) => {
		await writeCorpusFiles(outputDirectory);
		const environment = { ASSETS: { fetch: async (): Promise<Response> => Promise.reject(new Error('the assets must not answer an API path')) }};
		const response = await handleWorkerRequest(new Request(`https://react.filterenginez.com${API_PATH_PREFIX}${corpusPath(datasetId)}`), environment);

		expect(response.status).toBe(200);
		expectSameBytes(readFileSync(join(outputDirectory, corpusFileName(datasetId))), Buffer.from(await response.arrayBuffer()), corpusFileName(datasetId));
	});
});

describe('findCorpusFileProblems', () => {
	it('reports nothing for a directory writeCorpusFiles just wrote', async () => {
		await writeCorpusFiles(outputDirectory);

		expect(await findCorpusFileProblems(outputDirectory)).toEqual([]);
	});

	it('reports every dataset whose file is missing', async () => {
		const problems = await findCorpusFileProblems(outputDirectory);

		expect(problems).toEqual(datasetIds().map((datasetId) => `${join(outputDirectory, corpusFileName(datasetId))} is missing.`));
	});

	it('reports a file removed after writing', async () => {
		const [firstDatasetId = ''] = datasetIds();
		const removedPath = join(outputDirectory, corpusFileName(firstDatasetId));

		await writeCorpusFiles(outputDirectory);
		unlinkSync(removedPath);

		expect(await findCorpusFileProblems(outputDirectory)).toEqual([`${removedPath} is missing.`]);
	});

	it('reports a file whose bytes differ from the route', async () => {
		const [firstDatasetId = ''] = datasetIds();
		const stalePath = join(outputDirectory, corpusFileName(firstDatasetId));

		await writeCorpusFiles(outputDirectory);
		// Pretty-printed is the same JSON value and still the wrong file: the bytes are the contract.
		writeFileSync(stalePath, JSON.stringify(JSON.parse(readFileSync(stalePath, 'utf8')), null, 2));

		expect(await findCorpusFileProblems(outputDirectory)).toEqual([`${stalePath} differs from GET ${corpusPath(firstDatasetId)}.`]);
	});
});

describe('corpusFileContents', () => {
	it('refuses a dataset the route does not serve, naming the status', async () => {
		await expect(corpusFileContents('nope')).rejects.toThrow(/^GET \/corpus\/nope\.json answered 404: /u);
	});
});

describe('parseCorpusCliArgs', () => {
	it.each([
		[['dist/api/corpus'], { kind: 'write', outputDirectory: 'dist/api/corpus' }],
		[['--', '/abs/dir'], { kind: 'write', outputDirectory: '/abs/dir' }],
		[['--check', 'out'], { kind: 'check', outputDirectory: 'out' }],
		[['out', '--check'], { kind: 'check', outputDirectory: 'out' }],
		[['--help'], { kind: 'help' }],
		[['-h', 'out'], { kind: 'help' }],
	])('parses %j', (argv, expected) => {
		expect(parseCorpusCliArgs(argv)).toEqual(expected);
	});

	it.each([
		[[], 'Expected exactly one output directory; got 0.'],
		[['--check'], 'Expected exactly one output directory; got 0.'],
		[['one', 'two'], 'Expected exactly one output directory; got 2.'],
		[['--force', 'out'], 'Unknown option "--force".'],
	])('rejects %j', (argv, message) => {
		expect(parseCorpusCliArgs(argv)).toEqual({ kind: 'error', message });
	});
});
