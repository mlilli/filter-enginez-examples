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
	 *
	 * After a SvelteKit navigation that keeps the page (a `goto` or a link to the same route with
	 * another `?f=`), it tells the page's URL follower to look at the URL, which loads that filter state
	 * into the page's engine in place (`$lib/url/urlState.ts`). Back and Forward reach the follower
	 * through `popstate` as well; the follower loads a value once however many times it is told.
	 */
	// Load the shared visual system (brand tokens + ui-styles) once for the whole app.
	import '../app.css';

	import { notFoundPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
	import { notifyUrlNavigation } from '@filter-enginez/examples-shared/url-state-follower';
	import { vertical } from '@filter-enginez/examples-shared/verticals';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';

	const { children } = $props();

	afterNavigate(({ from, to }) => {
		if (from !== null && to !== null && from.url.pathname === to.url.pathname) {
			notifyUrlNavigation();
		}
	});

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
