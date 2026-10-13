<script setup lang="ts">
/**
 * `<ResultCount>` — the animated result count, shared by every dataset.
 *
 * @remarks
 * The Vue counterpart to `$lib/brand/ResultCount.svelte`. The roll is not decoration: on a large
 * corpus a filter can move the count by tens of thousands, and a number that teleports gives no sense
 * of MAGNITUDE — 12,431 → 89 and 12,431 → 11,902 look identical as instant swaps. Easing over 600ms
 * makes the size of the change legible without anyone reading both numbers.
 *
 * It is the Vue port of react-ui's `useTickingNumber`, kept in one component so every dataset's
 * results header shares it rather than carrying its own copy — the same arrangement Svelte uses.
 *
 * **`shown` is a deliberate non-reactive mirror of `displayed`.** The watcher needs the current
 * on-screen value as its animation START, and reading a `ref` it also writes would make the watcher
 * depend on its own output — a self-retriggering loop.
 *
 * Reduced motion snaps instead of rolling. The loader keyframes honor the media query in CSS, but this
 * roll is JS-driven, so it has to ask for itself.
 */
import { prefersReducedMotion } from '@filter-enginez/brand/motion';
import { computed, ref, watch } from 'vue';

const props = withDefaults(
	defineProps<{
		/** The live count to display. */
		count: number;
		/** Whether the engine is busy — drives the phosphor glow on the number. */
		isComputing?: boolean;
		/** Label beside the number — `results`, `bottles`, `listings`. */
		noun?: string;
		/** Unfiltered corpus size, for the delta and the "filtered from N total" line. */
		totalCount: number;
	}>(),
	{
		isComputing: false,
		noun: 'results',
	},
);

const emit = defineEmits<{
	/** Emitted `true` while the roll is in flight, `false` when it lands, so a caller can keep its
	 * indicator lit for the whole transition. */
	tickingChange: [isTicking: boolean];
}>();

/** The eased, on-screen value. Starts at the initial count so the first paint shows no roll. */
const displayed = ref(props.count);

/** The non-reactive mirror — see the docblock. Kept in step by the watcher from here on. */
let shown = props.count;

const delta = computed(() => props.count - props.totalCount);

watch(
	() => props.count,
	(target, _previous, onCleanup) => {
		if (shown === target) {
			return;
		}
		const from = shown;
		const clock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());
		const start = clock();
		let raf = 0;

		// Elapsed comes from `clock()` INSIDE the step, not from the rAF timestamp argument: jsdom's rAF
		// passes a timestamp on a different clock than `performance.now()`, which makes the elapsed
		// negative and the ease blow up. Real browsers align the two, so this is correct in both.
		const step = (): void => {
			const progress = Math.min(1, (clock() - start) / 600);
			const eased = 1 - (1 - progress) ** 3;
			const value = Math.round(from + (target - from) * eased);

			displayed.value = value;
			shown = value;
			if (progress < 1) {
				raf = requestAnimationFrame(step);
			} else {
				displayed.value = target;
				shown = target;
				emit('tickingChange', false);
			}
		};

		if (typeof requestAnimationFrame === 'function' && !prefersReducedMotion()) {
			emit('tickingChange', true);
			raf = requestAnimationFrame(step);
		} else {
			displayed.value = target;
			shown = target;
		}

		onCleanup(() => {
			if (raf !== 0) {
				cancelAnimationFrame(raf);
			}
		});
	},
);
</script>

<template>
	<div class="fe-result-count">
		<span class="fe-result-count__number" :class="{ 'fe-result-count__number--computing': isComputing }">
			{{ displayed.toLocaleString() }}
		</span>
		<span class="fe-result-count__label">{{ noun }}</span>
		<!-- Down is CYAN, up is GREEN — a narrowing is the data axis, a widening is success-shaped. The
		     sign comes from `toLocaleString` for negatives; only a positive needs a manual `+`. -->
		<span
			v-if="delta !== 0"
			class="fe-result-count__delta"
			:class="delta < 0 ? 'fe-result-count__delta--down' : 'fe-result-count__delta--up'"
		>
			{{ delta > 0 ? '+' : '' }}{{ delta.toLocaleString() }}
		</span>
		<!-- ALWAYS rendered, not gated on being filtered. `flex-basis: 100%` puts it on its own line
		     directly beneath the number, so the corpus size is legible before any filter is applied —
		     which is the number that tells you what the engine is working over. -->
		<span class="fe-result-count__total">filtered from {{ totalCount.toLocaleString() }} total</span>
		<!-- The status pill sits INSIDE the count row, not beside it, so on a phone the count identity
		     stays on line one and the status takes the third line instead of being pushed off screen. -->
		<span class="fe-result-count__status">
			<slot name="status" />
		</span>
	</div>
</template>
