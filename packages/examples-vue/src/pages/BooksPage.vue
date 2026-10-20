<script setup lang="ts">
/**
 * `/books` — boots the client-side books engine on mount, hydrates any shared `?f` link, wires the
 * engine → URL sync, and hands the engine to `<BooksView>`.
 *
 * **`shallowRef`, NOT `ref`/`reactive`.** A plain reactive proxy would deep-wrap the engine and its
 * `@preact/signals-core` signals, breaking `.subscribe`/`.value` + method `this` (filtering silently
 * stops) — the Vue equivalent of Svelte's `$state.raw` rule. `shallowRef` stays reactive on
 * reassignment (null → booted) without proxying the engine object.
 *
 * The boot caption is styled by `.fe-boot-caption--inline` in `ui-styles`, declared once for every
 * route, so this component authors no CSS at all.
 */
import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { bootBooksEngine } from '@filter-enginez/examples-shared/books-core';
import { BOOKS_BOOT_IDLE_CAPTION, BOOKS_RECORD_NOUN } from '@filter-enginez/examples-shared/books-domain';
import { bootCaptionParts, bootCaptionText } from '@filter-enginez/examples-shared/boot-caption';
import { onMounted, onUnmounted, shallowRef } from 'vue';

import BooksView from '../books/BooksView.vue';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';

const engine = shallowRef<SignalsEngine<Book> | null>(null);
// Teardown for the engine → URL sync loop (client-only; `null` until wired in `onMounted`).
let stopUrlSync: (() => void) | null = null;

onMounted(async () => {
	const booted = (await bootBooksEngine()).engine;

	// Hydrate filter state from a shared `?f` link BEFORE wiring the write-back — loadConfig fires its
	// change synchronously, so subscribing after it avoids an immediate redundant URL write.
	const urlConfig = readConfigFromUrl();

	if (urlConfig !== null) {
		try {
			booted.core.loadConfig(urlConfig);
		} catch {
			// Malformed / incompatible URL state — boot with the neutral corpus instead.
		}
	}
	stopUrlSync = startEngineUrlSync(booted);
	engine.value = booted;
});

onUnmounted(() => {
	stopUrlSync?.();
	engine.value?.dispose();
});

// This route awaits the books engine without subscribing to its boot progress, so it only renders the
// caption's idle state — but it renders it through the same module the streaming routes use rather
// than as markup, so a fourth state or an ARIA affordance added there reaches here too. The sentence
// comes from `books-domain`, shared with SvelteKit's and vanilla's pages. `bootCaptionText` because
// there is no live number to highlight.
const bootCaption = bootCaptionText(
	bootCaptionParts(null, { idleCaption: BOOKS_BOOT_IDLE_CAPTION, recordNoun: BOOKS_RECORD_NOUN }),
);
</script>

<template>
	<BooksView v-if="engine" :engine="engine" />
	<!-- `<main>`: until the engine boots, the caption is the page's main content. -->
	<main v-else>
		<p class="fe-boot-caption fe-boot-caption--inline">{{ bootCaption }}</p>
	</main>
</template>

