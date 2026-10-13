<script lang="ts">
	// Test-only harness mirroring `/books/+page.svelte`'s pattern: hold the (injected) engine in a rune,
	// then hand it to <BooksView>. Uses `$state.raw` — the load-bearing choice — so the guard test
	// proves filtering survives the parent's state holder. (Plain `$state` deep-proxies the engine and
	// breaks its signals; that's exactly what `$state.raw` avoids.)
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import BooksView from './BooksView.svelte';

	const { injected }: { injected: SignalsEngine<unknown> } = $props();

	// svelte-ignore state_referenced_locally
	const engine = $state.raw<SignalsEngine<unknown>>(injected);
</script>

<BooksView engine={engine as never} />
