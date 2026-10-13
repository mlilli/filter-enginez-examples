<script lang="ts">
	// Load the shared visual system (brand tokens + ui-styles) once for the whole app.
	import '../app.css';

	const { children } = $props();
</script>

{@render children()}
