<script lang="ts">
	import type { Book } from '@filter-enginez/mock-data/books';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { bootBooksEngine } from '@filter-enginez/examples-shared/books-core';
	import { BOOKS_BOOT_IDLE_CAPTION, BOOKS_RECORD_NOUN } from '@filter-enginez/examples-shared/books-domain';
	import { bootCaptionParts, bootCaptionText } from '@filter-enginez/examples-shared/boot-caption';
	import BooksView from '$lib/books/BooksView.svelte';
	import { readConfigFromUrl, startEngineUrlSync } from '$lib/url/urlState.js';
	import { onDestroy, onMount } from 'svelte';

	// Boot the main-thread books engine on mount (client-only). Once ready, hand it to <BooksView>,
	// whose script creates the reactive stores + provides context. Disposing on unmount detaches the
	// subscribe loop.
	//
	// **`$state.raw`, NOT `$state`.** Plain `$state` DEEP-PROXIES the assigned object; wrapping the
	// engine (and its `@preact/signals-core` signals) in Svelte's reactive proxy breaks signal
	// `.subscribe`/`.value` + method `this`, so filtering silently stops working. `$state.raw` keeps the
	// reassignment reactive (null → booted engine) without proxying the object itself. See
	// `BootHarness.test.ts` for the guard.
	let engine = $state.raw<SignalsEngine<Book> | null>(null);
	// Teardown for the engine → URL sync loop (client-only; `null` until wired in `onMount`).
	let stopUrlSync: (() => void) | null = null;

	onMount(async () => {
		const booted = (await bootBooksEngine()).engine;

		// Hydrate filter state from a shared `?f` link BEFORE wiring the write-back — loadConfig fires
		// its change synchronously, so subscribing after it avoids an immediate redundant URL write.
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
	});

	onDestroy(() => {
		stopUrlSync?.();
		engine?.dispose();
	});

	// This route awaits the books engine without subscribing to its boot progress, so it only renders the
	// caption's idle state — but it renders it through the same module the streaming routes use rather
	// than as markup, so a fourth state or an ARIA affordance added there reaches here too. The
	// sentence itself comes from `books-domain`, shared with Vue's and vanilla's books routes.
	// `bootCaptionText` because there is no live number to highlight.
	const bootCaption = bootCaptionText(
		bootCaptionParts(null, { idleCaption: BOOKS_BOOT_IDLE_CAPTION, recordNoun: BOOKS_RECORD_NOUN }),
	);
</script>

{#if engine}
	<BooksView {engine} />
{:else}
	<p class="fe-boot-caption fe-boot-caption--inline">{bootCaption}</p>
{/if}
