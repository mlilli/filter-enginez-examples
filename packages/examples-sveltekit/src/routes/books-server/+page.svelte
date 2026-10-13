<script lang="ts">
	/**
	 * `/books-server` — the server-backed books route: **visual + functional parity with `/books`**, but
	 * the browser never runs a filter. Every mutation round-trips to this app's own SvelteKit server tier
	 * (`/books-server/query` + `/books-server/corpus/:dataset`), which runs the isomorphic engine
	 * in-process — no separate `serve:api` process, no proxy.
	 *
	 * Progressive enhancement in two layers:
	 *   1. The server `load` (`+page.server.ts`) filters in-process for the SSR first paint, and
	 *      `<BooksServerFallback>` renders a plain GET `<form>` that works with **zero JavaScript**.
	 *   2. On mount, the client boots the live server-backed engine and swaps in the full `<BooksView>`
	 *      — the exact same component tree as `/books`.
	 *
	 * **`$state.raw`, NOT `$state`** — plain `$state` deep-proxies the engine and breaks its
	 * `@preact/signals-core` signals (see `/books/+page.svelte`). The boot module is **dynamically
	 * imported** inside `onMount` so its browser-only `reactive-signals/worker` + `comlink` graph never
	 * evaluates during SSR.
	 */

	import type { Book } from '@filter-enginez/mock-data/books';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
	import BooksServerFallback from '$lib/books/BooksServerFallback.svelte';
	import BooksView from '$lib/books/BooksView.svelte';
	import { readConfigFromUrl, startEngineUrlSync } from '$lib/url/urlState.js';
	import { onDestroy, onMount } from 'svelte';

	import type { PageData } from './$types.js';

	const { data }: { data: PageData } = $props();

	// The live server-backed engine (null until booted client-side). `$state.raw` — never `$state`.
	let engine = $state.raw<SignalsEngine<Book> | null>(null);
	let booting = $state(true);
	let bootError = $state<string | null>(null);
	let stopUrlSync: (() => void) | null = null;

	onMount(async () => {
		try {
			// Dynamic import keeps the worker/comlink boot graph out of the SSR bundle.
			const { bootBooksServerEngine } = await import('@filter-enginez/examples-shared/books-server-core');
			const booted = await bootBooksServerEngine({ baseUrl: '/books-server' });

			// Hydrate from a shared `?f=` link BEFORE wiring the write-back (loadConfig fires synchronously).
			const urlConfig = readConfigFromUrl();

			if (urlConfig !== null) {
				try {
					booted.core.loadConfig(urlConfig);
				} catch {
					// Malformed / incompatible URL state — boot with the neutral corpus instead.
				}
			}
			stopUrlSync = startEngineUrlSync(booted);
			engine = booted;
		} catch (caught) {
			bootError = caught instanceof Error ? caught.message : String(caught);
		} finally {
			booting = false;
		}
	});

	onDestroy(() => {
		stopUrlSync?.();
		engine?.dispose();
	});
</script>

<svelte:head>
	<title>Filter EngineZ · Books (server-filtered)</title>
</svelte:head>

{#if engine}
	<BooksView {engine} subtitle={verticalSubtitle('Books', 'sveltekit', 'server')} />
{:else}
	<BooksServerFallback
		applied={data.applied}
		{booting}
		{bootError}
		genres={data.genres}
		matched={data.ssr.matched}
		sample={data.ssr.sample}
		total={data.ssr.total}
	/>
{/if}
