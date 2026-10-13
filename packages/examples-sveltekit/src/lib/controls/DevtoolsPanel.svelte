<script lang="ts" generics="TItem">
	/**
	 * `<DevtoolsPanel>` — the engine's action log and time-travel timeline, for the SvelteKit vertical.
	 *
	 * @remarks
	 * **This is core's devtools, not Redux's.** It reads `engine.core.devtools.actionLog` and
	 * `.currentIndex`, and time-travels with `.jumpTo()` — all three live in `@filter-enginez/core`
	 * beside `TimeTravel`, `Replay` and `Diff`, with no store library anywhere in the path. That is
	 * exactly why this port is possible at all: only the VIEW was ever React.
	 *
	 * (Core's separate `ReduxDevtoolsBridge` pipes the same log to the browser extension over JSON-RPC.
	 * That is an optional export channel and has nothing to do with this component.)
	 *
	 * ### What this file is, and what it deliberately is not
	 *
	 * Every decision that is not markup comes from `@filter-enginez/examples-shared/devtools-core` —
	 * flattening a log record, the row tone, the short label, `HH:MM:SS`, the drag-scrub arithmetic and
	 * the keyboard step. Four verticals rendering four templates over one set of rules is the whole
	 * point; a port that re-derived the scrub math would differ from React's at the strip's ends and
	 * nobody would ever notice.
	 *
	 * The styling is shared too — `ui-styles` already carries the entire `.fe-devtools-*` block, written
	 * when React was the only consumer.
	 *
	 * ### The optimistic cursor
	 *
	 * Clicking a row tints it active immediately rather than waiting for the engine round trip; the
	 * engine cursor catches up a beat later and re-syncs through the adopt effect. Without it the
	 * timeline feels broken on the worker tier, where a jump is a message round trip — the user clicks,
	 * nothing moves, they click again. Re-syncing on every external change is also what makes keyboard
	 * undo / redo move the cursor.
	 *
	 * A WRITABLE `$derived`, for the same reason every wine control is one: it is seed, optimistic paint
	 * and adopt in a single construct, and `svelte/prefer-writable-derived` rejects the hand-rolled
	 * `$state` + `$effect` spelling.
	 */

	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import {
		actionTypeLabel,
		actionTypeTone,
		type DevtoolsEntry,
		formatLogTime,
		indexFromScrubPointer,
		normalizeEntry,
		scrubIndexForKey,
	} from '@filter-enginez/examples-shared/devtools-core';
	import { createEngineStores } from '@filter-enginez/svelte-signals';

	const {
		engine,
		isComputing = false,
		markBusy,
		onClose,
	}: {
		engine: SignalsEngine<TItem>;
		/** Dims the panel and blocks jumps while a recompute is in flight. */
		isComputing?: boolean;
		/** Bump the dataset's busy version, so the indicator lights on the same frame as the click. */
		markBusy: () => void;
		onClose: () => void;
	} = $props();

	// The engine is a prop that is never reassigned — the view renders this only after boot resolves.
	// svelte-ignore state_referenced_locally
	const { lastChange } = createEngineStores(engine);

	// Captured once, like the stores above: the engine prop is never reassigned for a mounted panel.
	// svelte-ignore state_referenced_locally
	// `devtools` is a public core API but is not on the narrowed core surface this component is typed
	// against, so it is reached through an explicit structural cast.
	const devtools = (engine.core as unknown as { devtools: unknown }).devtools as {
		actionLog: { toArray: () => readonly unknown[] };
		currentIndex: number;
		jumpTo: (index: number) => void;
	};

	/**
	 * The log, re-read on every engine change.
	 *
	 * @remarks
	 * Reading `$lastChange` is what registers the dependency; the value itself is unused, so the read
	 * looks pointless and is load-bearing — the same idiom `<WineView>` uses to drive its bundle fetch.
	 */
	const entries = $derived.by((): readonly DevtoolsEntry[] => {
		void $lastChange;

		return devtools.actionLog.toArray().map(normalizeEntry);
	});

	/** Where the ENGINE's cursor is. */
	const engineCursor = $derived.by((): number => {
		void $lastChange;

		return devtools.currentIndex;
	});

	/** Where the panel PAINTS the cursor — see the docblock on the optimistic cursor. */
	let activeCursor = $derived(engineCursor);

	let stripEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let isDragging = false;
	let lastScrubIndex = 0;

	// Keep the active row on screen. Covers click-to-jump, a scrub commit, keyboard undo/redo, and a
	// fresh action appended below the fold. Deferred a frame so the row exists at its new position.
	$effect(() => {
		void activeCursor;
		void entries.length;

		const scroller = scrollEl;

		if (scroller === null) {
			return undefined;
		}
		const handle = requestAnimationFrame(() => {
			scroller.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});

		return () => {
			cancelAnimationFrame(handle);
		};
	});

	/**
	 * Paint a cursor position without committing it — the mid-drag state.
	 *
	 * @param index - The index under the pointer.
	 */
	function scrubTo(index: number): void {
		activeCursor = index;
	}

	/**
	 * Time-travel the engine to an index.
	 *
	 * @remarks
	 * Paints first, then marks busy, then calls the engine — the order the React container uses, and it
	 * matters on the worker tier where the jump is a round trip.
	 *
	 * @param index - The log index to jump to.
	 */
	function commitTo(index: number): void {
		if (isComputing) {
			return;
		}
		activeCursor = index;
		markBusy();
		devtools.jumpTo(index);
	}

	/**
	 * Which index a pointer is over.
	 *
	 * @param clientX - The pointer's viewport x.
	 * @returns The index, or the current cursor when the strip has not been measured.
	 */
	function indexAt(clientX: number): number {
		if (stripEl === null) {
			return activeCursor;
		}

		return indexFromScrubPointer(clientX, stripEl.getBoundingClientRect(), entries.length);
	}
</script>

<section aria-label="Devtools action log" class="fe-devtools-panel">
	<header class="fe-devtools-panel__header">
		<div class="fe-devtools-panel__header-top">
			<h2 class="fe-devtools-panel__title">
				Devtools <span class="fe-devtools-panel__title-sep">·</span> Action Log
			</h2>
			<button type="button" class="fe-devtools-panel__close" aria-label="Close devtools" onclick={onClose}>
				<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
		<div class="fe-devtools-panel__meta">
			{entries.length}
			{entries.length === 1 ? 'action' : 'actions'}
			<span class="fe-devtools-panel__meta-sep">·</span>
			at step <span class="fe-devtools-panel__step">#{activeCursor + 1}</span>
		</div>
	</header>

	<div bind:this={scrollEl} class="fe-devtools-log" class:fe-devtools-log--computing={isComputing}>
		{#if entries.length === 0}
			<div class="fe-devtools-log__empty">No actions yet. Interact with a filter to record one.</div>
		{:else}
			{#each entries as entry, index (`${entry.timestamp}-${entry.type}-${entry.summary}-${index}`)}
				{@const isActive = index === activeCursor}
				{@const time = formatLogTime(entry.timestamp)}
				{@const label = actionTypeLabel(entry.type)}
				<!-- A real `<button>`, not a clickable div: keyboard focus and Enter/Space come free. -->
				<button
					type="button"
					class="fe-devtools-row"
					class:fe-devtools-row--active={isActive}
					aria-label={`Jump to action ${label} at ${time}`}
					aria-current={isActive ? 'true' : undefined}
					onclick={() => commitTo(index)}
				>
					<span class="fe-devtools-row__time">{time}</span>
					<span class="fe-devtools-row__type fe-devtools-row__type--{actionTypeTone(entry.type)}">{label}</span>
					<span class="fe-devtools-row__summary" title={entry.summary}>{entry.summary}</span>
					<span aria-hidden="true" class="fe-devtools-row__marker">{isActive ? '●' : '→'}</span>
				</button>
			{/each}
		{/if}
	</div>

	{#if entries.length === 0}
		<footer class="fe-devtools-timeline fe-devtools-timeline--empty">
			scrub timeline · click an action to jump
		</footer>
	{:else}
		<footer class="fe-devtools-timeline" class:fe-devtools-timeline--computing={isComputing}>
			<!-- ONE pointer-capture strip owns the whole gesture: down latches and snaps, move re-snaps,
			     up commits. The dots are `pointer-events: none` in ui-styles, so a press near a dot still
			     resolves through the strip's arithmetic rather than hitting the dot. -->
			<div
				bind:this={stripEl}
				class="fe-devtools-timeline__strip"
				role="slider"
				aria-label="Action log scrubber — drag to time-travel"
				aria-valuemin={0}
				aria-valuemax={entries.length - 1}
				aria-valuenow={activeCursor}
				tabindex="0"
				onpointerdown={(event) => {
					if (isComputing) {
						return;
					}
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					isDragging = true;
					lastScrubIndex = indexAt(event.clientX);
					scrubTo(lastScrubIndex);
				}}
				onpointermove={(event) => {
					if (!isDragging) {
						return;
					}
					const next = indexAt(event.clientX);

					if (next !== lastScrubIndex) {
						lastScrubIndex = next;
						scrubTo(next);
					}
				}}
				onpointerup={(event) => {
					if (!isDragging) {
						return;
					}
					isDragging = false;
					try {
						event.currentTarget.releasePointerCapture(event.pointerId);
					} catch {
						// Tolerated: the pointer can be gone already if the gesture ended off-window.
					}
					commitTo(lastScrubIndex);
				}}
				onpointercancel={() => {
					isDragging = false;
				}}
				onkeydown={(event) => {
					const next = scrubIndexForKey(event.key, activeCursor, entries.length);

					// `null` means a key this control does not own — let the browser have it, so Tab still
					// moves focus out of the scrubber.
					if (next === null) {
						return;
					}
					event.preventDefault();
					commitTo(next);
				}}
			>
				<div aria-hidden="true" class="fe-devtools-timeline__line"></div>
				<div class="fe-devtools-timeline__dots">
					{#each entries as entry, index (`${entry.timestamp}-${entry.type}-${index}`)}
						<span
							aria-hidden="true"
							class="fe-devtools-dot"
							class:fe-devtools-dot--active={index === activeCursor}
						></span>
					{/each}
				</div>
			</div>
			<div class="fe-devtools-timeline__caption">
				scrub timeline <span class="fe-devtools-timeline__caption-sep">·</span>
				click an action to jump
			</div>
		</footer>
	{/if}
</section>
