/**
 * SvelteKit configuration.
 *
 * @remarks
 * The `/books-server` and `/wine-server` routes run the isomorphic core in the SvelteKit server (SSR
 * filtering + `+server.ts` endpoints), so the app needs a server adapter rather than a static one.
 * `vitePreprocess` handles TS in `.svelte` `<script lang="ts">` blocks.
 *
 * ### Two adapters, chosen by `SVELTEKIT_ADAPTER`
 *
 * - **`node`** (the default) — `adapter-node`, for `pnpm build` on a development machine, `vite
 *   preview`, the end-to-end suite and anyone running the app as a Node server. Output: `build/`.
 * - **`cloudflare`** — `adapter-cloudflare`, for the deployed site at `svelte.filterenginez.com`. It
 *   reads `wrangler.jsonc` (next to this file) for where to write: the Worker to
 *   `build/cloudflare/_worker.js` and the static assets beside it. Set only by the deploy job in
 *   `.github/workflows/ci.yml`.
 *
 * Both write under `build/`, so the `build` script's final `strip-local-corpus` step covers either
 * output with the same arguments. Each adapter is imported only when selected: `adapter-cloudflare`
 * loads `wrangler` at import time, which a Node build has no reason to pay for. An unknown value is an
 * error rather than a silent fallback, so a typo in the deploy job cannot ship a Node build to a
 * Worker.
 *
 * ### Every page carries its stylesheets
 *
 * An `inlineStyleThreshold` of infinity has SvelteKit write the CSS each page needs into the page, in a
 * `<style>` where the `<link rel="stylesheet">` would be, instead of linking it: a browser renders
 * nothing until a linked stylesheet arrives, so every first visit would wait a round trip for it. The
 * prerendered hub and every server-rendered page draw their markup before any script runs, so the CSS
 * has to be there for the first paint, and in the page is the only place that costs no round trip.
 * SvelteKit rewrites each `url()` to resolve from the page, and keeps the link, `disabled`, so the
 * client router knows the stylesheet is already applied and never fetches it. The CSS is the same, in
 * the same order, so every page renders as before. `scripts/check-startup-budget.mjs` fails the build
 * if the hub links a stylesheet that holds up its first render.
 *
 * ### The local-only wine corpus never reaches either adapter
 *
 * On a machine where `pnpm link:wine-corpus` has run, `static/` holds two ~116 MB corpus files, and
 * Vite copies them into the client output. Both adapters copy that directory again — `adapter-node`
 * then gzip + brotli-compresses the JSON one, which takes minutes, only for the build script's final
 * `strip-local-corpus` step to delete all of it. Stripping the client directory first keeps the corpus
 * out of every later step; the final strip stays as the guarantee
 * `tests/tooling/buildsStripLocalCorpus.test.ts` checks.
 */
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripLocalCorpus } from '../../scripts/lib/local-corpus.mjs';

/** The step every app's build ends with: it writes each dataset route's booted page into its HTML. */
const PRERENDER_STEP = fileURLToPath(new URL('../../scripts/prerender-routes.mjs', import.meta.url));

/** The adapter targets, and what each one is doing while the build waits on it. */
const ADAPTER_ACTIVITIES = {
	cloudflare: 'Writing the Cloudflare Worker and copying its static assets…',
	node: 'Writing the Node server and precompressing client assets (gzip + brotli)…',
};

const adapterTarget = process.env.SVELTEKIT_ADAPTER ?? 'node';

/**
 * Import and configure the selected adapter.
 *
 * @param {string} target - `node` or `cloudflare`.
 * @returns {Promise<import('@sveltejs/kit').Adapter>} The configured adapter.
 */
async function loadAdapter(target) {
	switch (target) {
		case 'cloudflare': {
			const { default: cloudflareAdapter } = await import('@sveltejs/adapter-cloudflare');

			return cloudflareAdapter({ config: 'wrangler.jsonc' });
		}
		case 'node': {
			const { default: nodeAdapter } = await import('@sveltejs/adapter-node');

			return nodeAdapter();
		}
		default:
			throw new Error(`SVELTEKIT_ADAPTER must be "node" or "cloudflare"; got "${target}".`);
	}
}

/**
 * Wrap an adapter so the local-only wine corpus is removed from the client output before the adapter
 * copies it anywhere, and each dataset route's prerendered page carries its booted snapshot.
 *
 * @remarks
 * The snapshot step (`scripts/prerender-routes.mjs`, the same one the other five apps' builds end with)
 * serves the client output and the prerendered pages together, as the deployed Worker does, opens each
 * dataset route the app renders in the browser (`/books`, `/real-estate`, `/wine`; the server-backed
 * routes render on the server) and writes what it shows into the page. After the corpus strip, so the
 * snapshot shows the corpus the site deploys; before the adapter, which copies the pages.
 *
 * @param {import('@sveltejs/kit').Adapter} adapter - The adapter to wrap.
 * @param {string} activity - What the adapter is doing, for the build log.
 * @returns {import('@sveltejs/kit').Adapter} The same adapter, corpus-free.
 */
function withoutLocalCorpus(adapter, activity) {
	return {
		...adapter,
		async adapt(builder) {
			const removed = stripLocalCorpus(builder.getClientDirectory());

			if (removed.length > 0) {
				builder.log(`Left out ${removed.length} local-only wine corpus file(s) before adapting`);
			}

			const pages = join(builder.config.kit.outDir, 'output', 'prerendered', 'pages');
			const prerendered = spawnSync(
				process.execPath,
				[PRERENDER_STEP, builder.getClientDirectory(), '--host', 'sveltekit', '--pages', pages],
				{ stdio: 'inherit' },
			);

			if (prerendered.status !== 0) {
				throw new Error('prerender-routes failed; its message is above.');
			}

			builder.log(activity);
			const startedAt = performance.now();

			await adapter.adapt(builder);
			builder.log(`Adapter finished in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
		},
	};
}

/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		adapter: withoutLocalCorpus(
			await loadAdapter(adapterTarget),
			ADAPTER_ACTIVITIES[adapterTarget] ?? adapterTarget,
		),
		// Every page carries the CSS it needs instead of linking it (see the remarks above).
		inlineStyleThreshold: Number.POSITIVE_INFINITY,
	},
	preprocess: vitePreprocess(),
};
