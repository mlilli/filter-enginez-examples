/**
 * SvelteKit configuration.
 *
 * @remarks
 * `adapter-node` so the `/books-server` and `/wine-server` routes can run the isomorphic core in the
 * SvelteKit server (SSR filtering + `+server.ts` endpoints). `vitePreprocess` handles TS in `.svelte`
 * `<script lang="ts">` blocks.
 *
 * The adapter is wrapped so the local-only wine corpus never reaches it. On a machine where
 * `pnpm link:wine-corpus` has run, `static/` holds two ~116 MB corpus files, and Vite copies them into
 * the client output. `adapter-node` would then copy them again and gzip + brotli-compress the JSON one,
 * which takes minutes, only for the build script's final `strip-local-corpus` step to delete all of it.
 * Stripping the client directory first keeps the corpus out of every later step; the final strip stays
 * as the guarantee `tests/tooling/buildsStripLocalCorpus.test.ts` checks.
 */
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

import { stripLocalCorpus } from '../../scripts/lib/local-corpus.mjs';

const nodeAdapter = adapter();

/** @type {import('@sveltejs/kit').Adapter} */
const nodeAdapterWithoutLocalCorpus = {
	...nodeAdapter,
	async adapt(builder) {
		const removed = stripLocalCorpus(builder.getClientDirectory());

		if (removed.length > 0) {
			builder.log(`Left out ${removed.length} local-only wine corpus file(s) before adapting`);
		}

		builder.log('Writing the Node server and precompressing client assets (gzip + brotli)…');
		const startedAt = performance.now();

		await nodeAdapter.adapt(builder);
		builder.log(`Adapter finished in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
	},
};

/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		adapter: nodeAdapterWithoutLocalCorpus,
	},
	preprocess: vitePreprocess(),
};
