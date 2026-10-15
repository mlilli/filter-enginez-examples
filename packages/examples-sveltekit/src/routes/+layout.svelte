<script lang="ts">
	/**
	 * The root layout: the shared visual system, and each page's title, description and canonical URL.
	 *
	 * @remarks
	 * The head tags are rendered here, on the server as well as in the browser, from the values
	 * `examples-shared/page-meta` decides for all six apps, so the HTML a crawler receives already names
	 * the page and its one canonical URL. An error page (a 404, say) gets `noindex` and no canonical.
	 * Pages carry no `<title>` of their own: a second one would follow this one in the head, and a
	 * browser reads the first.
	 */
	// Load the shared visual system (brand tokens + ui-styles) once for the whole app.
	import '../app.css';

	import { notFoundPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
	import { vertical } from '@filter-enginez/examples-shared/verticals';
	import { page } from '$app/stores';

	const { children } = $props();

	const meta = $derived(
		$page.error === null ? verticalPageMeta('sveltekit', $page.url.pathname) : notFoundPageMeta(vertical('sveltekit').pageTitle),
	);
</script>

<svelte:head>
	<title>{meta.title}</title>
	{#if meta.canonicalUrl === null}
		<meta name="robots" content="noindex" />
	{:else}
		<meta name="description" content={meta.description} />
		<link rel="canonical" href={meta.canonicalUrl} />
	{/if}
</svelte:head>

{@render children()}
