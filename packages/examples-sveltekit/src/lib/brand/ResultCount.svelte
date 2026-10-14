<script lang="ts">
	/**
	 * `<ResultCount>` — the animated result count, shared by every dataset.
	 *
	 * @remarks
	 * The roll is not decoration. On a 150k corpus a filter can move the count by tens of thousands,
	 * and a number that simply teleports gives no sense of MAGNITUDE — 12,431 → 89 and 12,431 → 11,902
	 * look identical as instant swaps. Easing over 600ms makes the size of the change legible without
	 * anyone reading both numbers.
	 *
	 * One component shared by every results header, so no two datasets can roll with different easings
	 * over one engine.
	 *
	 * **`shown` is a deliberate non-reactive mirror of `displayed`.** The effect needs the current
	 * on-screen value as its animation START, and reading `displayed` inside the effect would make the
	 * effect depend on the thing it writes — a self-retriggering loop.
	 *
	 * Reduced motion snaps instead of rolling. The loader keyframes honor the media query in CSS, but
	 * this roll is JS-driven, so it has to ask for itself.
	 */

	import type { Snippet } from 'svelte';

	import { prefersReducedMotion } from '@filter-enginez/brand/motion';

	interface Props {
		/** The live count to display. */
		readonly count: number;
		/** Whether the engine is busy — drives the phosphor glow on the number. */
		readonly isComputing?: boolean;
		/** Unfiltered corpus size, for the delta and the "of N" suffix. */
		readonly totalCount: number;
		/** Label beside the number — `results`, `bottles`, and so on. */
		readonly noun?: string;
		/** Called with `true` while the roll is in flight, so a caller can keep its indicator lit. */
		readonly onTickingChange?: (isTicking: boolean) => void;
		/** The engine-status pill. A snippet so the count row owns its DOM order — see the markup. */
		readonly status?: Snippet;
	}

	const { count, isComputing = false, noun = 'results', onTickingChange, status, totalCount }: Props = $props();

	// svelte-ignore state_referenced_locally
	let displayed = $state(count);
	// The non-reactive mirror. Reading the INITIAL count here is exactly intended — the effect keeps
	// it in step from then on, and making it reactive would create the self-triggering loop the
	// docblock describes.
	// svelte-ignore state_referenced_locally
	let shown = count;

	const delta = $derived(count - totalCount);

	$effect(() => {
		const target = count;

		if (shown === target) {
			return undefined;
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

			displayed = value;
			shown = value;
			if (progress < 1) {
				raf = requestAnimationFrame(step);
			} else {
				displayed = target;
				shown = target;
				onTickingChange?.(false);
			}
		};

		if (typeof requestAnimationFrame === 'function' && !prefersReducedMotion()) {
			onTickingChange?.(true);
			raf = requestAnimationFrame(step);
		} else {
			displayed = target;
			shown = target;
		}

		return () => {
			if (raf !== 0) {
				cancelAnimationFrame(raf);
			}
		};
	});
</script>

<div class="fe-result-count">
	<span class="fe-result-count__number" class:fe-result-count__number--computing={isComputing}>
		{displayed.toLocaleString()}
	</span>
	<span class="fe-result-count__label">{noun}</span>
	{#if delta !== 0}
		<!-- Down is CYAN, up is GREEN — a narrowing is the data axis, a widening is success-shaped.
		     The sign comes from `toLocaleString` for negatives; only a positive needs a manual `+`. -->
		<span class="fe-result-count__delta {delta < 0 ? 'fe-result-count__delta--down' : 'fe-result-count__delta--up'}">
			{delta > 0 ? '+' : ''}{delta.toLocaleString()}
		</span>
	{/if}
	<!-- ALWAYS rendered, not gated on being filtered. `flex-basis: 100%` puts it on its own line
	     directly beneath the number, so the corpus size is legible before any filter is applied —
	     which is the number that tells you what the engine is working over. -->
	<span class="fe-result-count__total">filtered from {totalCount.toLocaleString()} total</span>
	<span class="fe-result-count__status">
		{@render status?.()}
	</span>
</div>
