<script lang="ts">
	/**
	 * `<UrlFormatToggle>` — cycles the shareable-URL serializer format (Readable → Compact → Base64)
	 * and re-encodes the current `?f` param into the new format so the switch shows in the address bar
	 * immediately. The Svelte port of examples-shared's React `<UrlFormatToggle>`, styled to match
	 * (mono, gray-outlined, ≥44px touch target).
	 *
	 * Purely a URL-representation change: the tagged serializer's `decode` auto-detects the OLD format,
	 * so the engine state is untouched and links shared in any format still decode.
	 */

	import { cycleUrlFormat, reEncodeUrlFormat, URL_FORMAT_LABELS, urlFormat } from './urlState.js';

	/** Advance the format then re-encode the current URL param into it. */
	function handleCycle(): void {
		reEncodeUrlFormat(cycleUrlFormat());
	}
</script>

<button
	type="button"
	class="fe-url-format-toggle"
	onclick={handleCycle}
	aria-label={`Shareable-URL format: ${URL_FORMAT_LABELS[$urlFormat]}. Activate to cycle formats.`}
	title="Cycle the shareable-URL encoding"
>
	<span class="fe-url-format-toggle__kicker">URL</span>
	{URL_FORMAT_LABELS[$urlFormat]}
</button>
