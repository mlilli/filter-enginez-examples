/**
 * Every deployed corpus is a static asset, never a Worker response.
 *
 * @remarks
 * The sites run on the Cloudflare Workers Free plan, which allows 10 ms of CPU per request. The
 * server-backed routes boot by fetching a whole corpus once (`…/corpus/<dataset>.json`, see
 * `examples-shared/src/books/serverEngine.ts`), and serializing one takes several times that limit; a
 * Worker that keeps exceeding it is stopped, and every route it serves fails with it. So each corpus is
 * a file in the deployed assets, and this guard holds the pieces of that arrangement together, none of
 * which any other gate sees:
 *
 * - **The API Worker apps** (those whose `wrangler.jsonc` `main` is examples-server's
 *   `cloudflareWorker.ts`) exclude `/api/corpus/*` from `run_worker_first`, so the assets answer it.
 *   The excluded path must be where the browser looks (`/api` + `/corpus/`) and where the deploy job
 *   writes.
 * - **The deploy job writes and checks the files** for exactly those apps, before `wrangler deploy`.
 *   These apps answer unknown paths with their HTML not-found page, so a missing file would surface
 *   as a JSON parse error in a browser, far from its cause; the check is what makes it fail loudly.
 * - **SvelteKit's corpus routes are prerendered**, each with `entries` naming the dataset its page
 *   filters, so `vite build` writes the files and adapter-cloudflare serves them as assets.
 * - **Nothing deletes or commits them**: the local-only-corpus strip step leaves them alone, and the
 *   build directories they are written into are ignored by git and Prettier.
 *
 * Every list is derived — the targets from the `wrangler.jsonc` files, the datasets from
 * examples-server's registry, the routes from the SvelteKit routes directory — so a new site, dataset
 * or server-backed route is covered the day it appears.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
	API_CORPUS_ASSETS_SUBDIRECTORY,
	EXAMPLES_SERVER_WORKER_ENTRY,
	listDeployTargets,
} from '../../scripts/lib/deploy-targets.mjs';
import { workerRunsFirstFor } from './support/workersRouting.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The `run_worker_first` every API Worker app carries: the API, minus the corpus files, and the
 * well-known URIs the Worker answers with a 404 (`wellKnownNotFound.test.ts`).
 */
const API_RUN_WORKER_FIRST = ['/api/*', `!/${API_CORPUS_ASSETS_SUBDIRECTORY}/*`, '/.well-known/*'];

/** The SvelteKit app's routes directory, relative to the repository root. */
const SVELTEKIT_ROUTES = 'packages/examples-sveltekit/src/routes';

const TARGETS = listDeployTargets();
const API_TARGETS = TARGETS.filter((target) => target.apiCorpusDirectory !== null);

/**
 * Read a repository file as text.
 *
 * @param path - Path relative to the repository root.
 * @returns The contents.
 */
function readRepoFile(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * The value of a top-level `export const NAME = '…';` string constant, read as text.
 *
 * @param path - The source file, relative to the repository root.
 * @param name - The constant's name.
 * @returns Its value, or `''` when the declaration is not found.
 */
function exportedStringConstant(path: string, name: string): string {
	return new RegExp(`^export const ${name} = '([^']*)';$`, 'mu').exec(readRepoFile(path))?.[1] ?? '';
}

/**
 * The dataset ids examples-server registers, read from `DATASETS` in `datasets.ts`.
 *
 * @returns The ids, in registry order.
 */
function registeredDatasetIds(): readonly string[] {
	const registry = /const DATASETS: readonly DatasetDescriptor\[\] = \[([\s\S]*?)\n\];/u.exec(readRepoFile('packages/examples-server/src/datasets.ts'))?.[1] ?? '';

	return [...registry.matchAll(/^\t\tid: '([a-z-]+)',$/gmu)].map(([, id]) => id ?? '');
}

/**
 * The `deploy` job's block in `ci.yml`, from its key to the next job or the end of the file.
 *
 * @returns The block's text.
 */
function deployJobBlock(): string {
	return /^ {2}deploy:\n[\s\S]*?(?=^ {2}\S|(?![\s\S]))/mu.exec(readRepoFile('.github/workflows/ci.yml'))?.[0] ?? '';
}

/**
 * Every `+server.ts` under a `corpus` directory of the SvelteKit routes, relative to the routes
 * directory (POSIX separators).
 *
 * @returns Paths such as `wine-server/corpus/[dataset].json/+server.ts`.
 */
function sveltekitCorpusRouteFiles(): readonly string[] {
	return readdirSync(resolve(REPO_ROOT, SVELTEKIT_ROUTES), { encoding: 'utf8', recursive: true })
		.map((path) => path.split(sep).join('/'))
		.filter((path) => path.endsWith('/+server.ts') && path.split('/').includes('corpus'))
		.sort();
}

/**
 * The SvelteKit routes that filter on the server: a page directory with a `query/+server.ts` endpoint.
 *
 * @returns Route directory names, e.g. `wine-server`.
 */
function sveltekitServerBackedRoutes(): readonly string[] {
	return readdirSync(resolve(REPO_ROOT, SVELTEKIT_ROUTES), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(resolve(REPO_ROOT, SVELTEKIT_ROUTES, entry.name, 'query', '+server.ts')))
		.map((entry) => entry.name)
		.sort();
}

describe('the corpus URL', () => {
	it('is where the browser transport looks: <baseUrl>/corpus/<dataset>.json', () => {
		expect(readRepoFile('packages/examples-shared/src/books/serverEngine.ts')).toContain('getJson<{ records: readonly T[] }>(`/corpus/${dataset}.json`)');
		expect(exportedStringConstant('packages/examples-server/src/corpusDocument.ts', 'CORPUS_PATH_PREFIX')).toBe('/corpus/');
		expect(exportedStringConstant('packages/examples-server/src/corpusDocument.ts', 'CORPUS_FILE_EXTENSION')).toBe('.json');
	});

	it('is, behind the API prefix, the assets directory the deploy job writes into', () => {
		const apiPrefix = exportedStringConstant('packages/examples-server/src/workerRequestHandler.ts', 'API_PATH_PREFIX');
		const corpusPrefix = exportedStringConstant('packages/examples-server/src/corpusDocument.ts', 'CORPUS_PATH_PREFIX');

		expect(apiPrefix).toBe('/api');
		expect(`/${API_CORPUS_ASSETS_SUBDIRECTORY}/`).toBe(`${apiPrefix}${corpusPrefix}`);
	});
});

describe('API Worker apps', () => {
	it('finds them, so the cases below are not vacuous', () => {
		expect(API_TARGETS.map((target) => target.packageDirectory)).toEqual(
			expect.arrayContaining(['examples-angular', 'examples-react-plain', 'examples-react-rtk', 'examples-vanilla']),
		);
		expect(existsSync(resolve(REPO_ROOT, EXAMPLES_SERVER_WORKER_ENTRY)), `${EXAMPLES_SERVER_WORKER_ENTRY} is missing`).toBe(true);
	});

	for (const target of TARGETS) {
		const isApiTarget = target.config.main !== undefined
			&& posix.join(posix.dirname(target.configPath), target.config.main) === EXAMPLES_SERVER_WORKER_ENTRY;

		it(`${target.packageDirectory}: is an API Worker app exactly when its main is examples-server’s Worker`, () => {
			expect(target.apiCorpusDirectory).toBe(isApiTarget ? `${target.assetsDirectory}/${API_CORPUS_ASSETS_SUBDIRECTORY}` : null);
		});

		if (isApiTarget) {
			it(`${target.packageDirectory}: runs the Worker first for /api/*, except the corpus files`, () => {
				const runWorkerFirst = target.config.assets?.run_worker_first;

				expect(runWorkerFirst, `set "run_worker_first": ${JSON.stringify(API_RUN_WORKER_FIRST)}`).toEqual(API_RUN_WORKER_FIRST);
				expect(workerRunsFirstFor(runWorkerFirst, '/api/query')).toBe(true);
				for (const datasetId of registeredDatasetIds()) {
					expect(workerRunsFirstFor(runWorkerFirst, `/${API_CORPUS_ASSETS_SUBDIRECTORY}/${datasetId}.json`), `/api/corpus/${datasetId}.json reaches the Worker`).toBe(false);
				}
			});
		}
	}
});

describe('the deploy job', () => {
	const job = deployJobBlock();
	const writeCommand = 'pnpm --filter @filter-enginez/examples-server corpus:write "$PWD/$TARGET_API_CORPUS"';
	const checkCommand = 'pnpm --filter @filter-enginez/examples-server corpus:check "$PWD/$TARGET_API_CORPUS"';

	it('exists, so the cases below are not vacuous', () => {
		expect(job).toContain('wrangler deploy');
	});

	it('hands each matrix entry its corpus directory: set for exactly the API Worker apps', () => {
		const run = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/list-deploy-targets.mjs')], { cwd: REPO_ROOT, encoding: 'utf8' });
		const matrix = JSON.parse(run.stdout) as readonly { readonly apiCorpus: string; readonly package: string }[];

		expect(run.status, run.stderr).toBe(0);
		expect(matrix.map((entry) => [entry.package, entry.apiCorpus])).toEqual(
			TARGETS.map((target) => [target.packageName, target.apiCorpusDirectory ?? '']),
		);
		expect(matrix.filter((entry) => entry.apiCorpus !== '')).toHaveLength(API_TARGETS.length);
		expect(job).toMatch(/^ {6}TARGET_API_CORPUS: \$\{\{ matrix\.target\.apiCorpus \}\}$/mu);
	});

	it('writes the corpus files, then checks them, before uploading', () => {
		expect(job.indexOf(writeCommand), 'the deploy job must run corpus:write').toBeGreaterThan(-1);
		expect(job.indexOf(checkCommand), 'the deploy job must run corpus:check').toBeGreaterThan(job.indexOf(writeCommand));
		expect(job.indexOf(checkCommand)).toBeLessThan(job.indexOf('wrangler deploy'));
	});

	it('skips the step only for a site with no corpus directory', () => {
		const step = job.slice(job.lastIndexOf('- name:', job.indexOf(writeCommand)), job.indexOf(checkCommand));

		expect(step).toMatch(/if \[ -z "\$TARGET_API_CORPUS" \]; then\n\s+echo "[^"]+"\n\s+exit 0\n\s+fi\n/u);
		expect([...step.matchAll(/exit 0/gu)]).toHaveLength(1);
	});

	it('runs scripts examples-server defines', () => {
		const manifest = JSON.parse(readRepoFile('packages/examples-server/package.json')) as { readonly scripts: Readonly<Record<string, string>> };

		expect(manifest.scripts['corpus:write']).toBe('tsx src/write-corpus.ts');
		expect(manifest.scripts['corpus:check']).toBe('tsx src/write-corpus.ts --check');
		expect(existsSync(resolve(REPO_ROOT, 'packages/examples-server/src/write-corpus.ts'))).toBe(true);
	});
});

describe('SvelteKit’s corpus routes', () => {
	const routeFiles = sveltekitCorpusRouteFiles();
	const serverBackedRoutes = sveltekitServerBackedRoutes();

	it('exist for every server-backed route, and only there', () => {
		expect(serverBackedRoutes.length, 'no server-backed SvelteKit route found').toBeGreaterThanOrEqual(2);
		expect(routeFiles).toEqual(serverBackedRoutes.map((route) => `${route}/corpus/[dataset].json/+server.ts`));
	});

	for (const route of serverBackedRoutes) {
		it(`${route}: prerenders its page’s dataset into <dataset>.json`, () => {
			const source = readRepoFile(`${SVELTEKIT_ROUTES}/${route}/corpus/[dataset].json/+server.ts`);
			const pageDataset = /^const DATASET = '([a-z-]+)';$/mu.exec(readRepoFile(`${SVELTEKIT_ROUTES}/${route}/+page.server.ts`))?.[1];
			const entries = /^export const entries: EntryGenerator = \(\) => \[([^\]]*)\];$/mu.exec(source)?.[1];

			expect(source).toMatch(/^export const prerender = true;$/mu);
			expect(pageDataset, `${route}/+page.server.ts declares no DATASET`).toBeDefined();
			expect(registeredDatasetIds()).toContain(pageDataset);
			expect(entries, 'export `entries` naming the datasets to prerender').toBeDefined();
			expect([...(entries ?? '').matchAll(/\{ dataset: '([a-z-]+)' \}/gu)].map(([, id]) => id)).toEqual([pageDataset]);
		});
	}
});

describe('the corpus files survive the build and stay out of the repository', () => {
	let scratch = '';

	afterEach(() => {
		if (scratch !== '') {
			rmSync(scratch, { force: true, recursive: true });
			scratch = '';
		}
	});

	it('are left alone by the local-only-corpus strip step', () => {
		const datasetIds = registeredDatasetIds();
		const files = datasetIds.flatMap((datasetId) => [`${API_CORPUS_ASSETS_SUBDIRECTORY}/${datasetId}.json`, `${datasetId}-server/corpus/${datasetId}.json`]);

		expect(datasetIds.length, 'no dataset ids read from datasets.ts').toBeGreaterThanOrEqual(2);
		scratch = mkdtempSync(join(tmpdir(), 'static-corpus-assets-'));
		for (const file of files) {
			mkdirSync(dirname(join(scratch, file)), { recursive: true });
			writeFileSync(join(scratch, file), '{}');
		}

		const run = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/strip-local-corpus.mjs'), scratch], { encoding: 'utf8' });

		expect(run.status, run.stderr).toBe(0);
		expect(files.filter((file) => !existsSync(join(scratch, file)))).toEqual([]);
	});

	it('are written inside build output that git and Prettier ignore', () => {
		const gitignore = readRepoFile('.gitignore').split('\n');
		const prettierignore = readRepoFile('.prettierignore').split('\n');

		for (const target of API_TARGETS) {
			// `packages/<package>/<build directory>/…`
			const buildDirectory = (target.apiCorpusDirectory ?? '').split('/')[2] ?? '';

			expect(['build', 'dist'], `${target.apiCorpusDirectory ?? ''} is not under a build directory`).toContain(buildDirectory);
			expect(gitignore, `.gitignore must list ${buildDirectory}/`).toContain(`${buildDirectory}/`);
			expect(prettierignore, `.prettierignore must list **/${buildDirectory}/`).toContain(`**/${buildDirectory}/`);
		}
	});
});
