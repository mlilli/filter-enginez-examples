<script setup lang="ts">
/**
 * `<CopyLinkButton>` — copies the current page URL to the clipboard, with brief "Copied!" feedback.
 * The Vue port of examples-shared's React `<CopyLinkButton>`. Because the engine → URL sync keeps the
 * live filter state encoded in the address bar, the current URL IS a shareable link to the exact filter
 * state — this button just copies it. Cyan-accented per the design system (sharing a filter state is a
 * data/identity affordance). Guards `navigator`/`window`.
 */
import { onUnmounted, ref } from 'vue';

/** How long the "Copied!" confirmation stays up before reverting to "Copy link". */
const COPIED_FEEDBACK_MS = 1600;

const isCopied = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

/** Copy `location.href`; on success flash "Copied!" briefly. Clipboard rejection is a silent no-op. */
function handleCopy(): void {
	if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
		return;
	}
	void navigator.clipboard.writeText(window.location.href).then(
		() => {
			isCopied.value = true;
			if (resetTimer !== null) {
				clearTimeout(resetTimer);
			}
			resetTimer = setTimeout(() => {
				isCopied.value = false;
			}, COPIED_FEEDBACK_MS);
		},
		() => undefined,
	);
}

onUnmounted(() => {
	if (resetTimer !== null) {
		clearTimeout(resetTimer);
	}
});
</script>

<template>
	<button type="button" class="fe-copy-link" aria-live="polite" @click="handleCopy">
		<svg
			viewBox="0 0 24 24"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
			<path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
		</svg>
		{{ isCopied ? 'Copied!' : 'Copy link' }}
	</button>
</template>
