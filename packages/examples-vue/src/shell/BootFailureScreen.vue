<script setup lang="ts">
/**
 * `<BootFailureScreen>` — what a dataset route shows when its engine could not start.
 *
 * @remarks
 * The same screen in every app: a `<main>` holding an element with `role="alert"`, which carries the
 * dataset's `BOOT_FAILURE_COPY` title, the error's own message, and the copy's hint. The alert sits
 * INSIDE the `<main>` rather than on it, because a `role` on the landmark element would replace the
 * landmark.
 *
 * The default slot follows the hint, for what is a fact about this app's build rather than about the
 * engine: the wine route uses it to name `VITE_WINE_TIER=default`, the Vite apps' way to boot the
 * 10,000-wine main-thread tier instead.
 */
import { BOOT_FAILURE_COPY, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';
import { computed } from 'vue';

const props = defineProps<{
	/** Which dataset failed; picks the title and the hint. */
	dataset: BootFailureDataset;
	/** The error's message. */
	message: string;
}>();

/** The dataset's title and hint. */
const copy = computed(() => BOOT_FAILURE_COPY[props.dataset]);
</script>

<template>
	<main>
		<div class="fe-boot-error" role="alert">
			<p class="fe-boot-error__title">{{ copy.title }}</p>
			<p class="fe-boot-error__detail">{{ message }}</p>
			<p class="fe-boot-error__hint">
				{{ copy.hint }}
				<slot />
			</p>
		</div>
	</main>
</template>

<style scoped>
/* Local to the one component every route's failure renders through. */
.fe-boot-error {
	margin: 3rem auto;
	max-width: 34rem;
	padding: 1.5rem;
	border: 1px solid var(--gray-4);
	border-radius: var(--radius-lg);
	background: var(--gray-1);
}

.fe-boot-error__title {
	margin: 0 0 0.5rem;
	color: var(--danger);
	font-weight: 600;
}

.fe-boot-error__detail {
	margin: 0 0 0.5rem;
	color: var(--gray-9);
	font-family: var(--font-mono);
	font-size: 0.8125rem;
}

.fe-boot-error__hint {
	margin: 0;
	color: var(--gray-9);
	font-size: 0.875rem;
}
</style>
