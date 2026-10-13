<script lang="ts" generics="TItem">
	/**
	 * `<TimeTravelControls>` — the header cluster: undo, redo, and the devtools toggle.
	 *
	 * @remarks
	 * A one-for-one port of `@filter-enginez/examples-shared/devtools`'s React cluster, down to the
	 * icons. That sameness is the point: undo is a `↩`, redo is a `↪`, and the devtools toggle is a
	 * terminal prompt `>_` on every vertical, because a user who learns the header on `/books` should
	 * not have to re-learn it on the Svelte app.
	 *
	 * **These are the engine's own devtools, not Redux's.** `engine.core.devtools` is an LRU action log
	 * plus a time-travel cursor implemented in `@filter-enginez/core`, with no store library in the path
	 * — which is precisely why this vertical can carry the identical surface.
	 *
	 * ### Why undo / redo live up here rather than in the panel
	 *
	 * They are ordinary editing affordances someone reaches for after a misclick. Burying them inside a
	 * developer surface makes the common case require the rare one. The panel is the timeline; these are
	 * the two steps either side of the cursor.
	 *
	 * ### The keyboard shortcut is the same binding, not a second one
	 *
	 * `attachUndoRedoKeyboard` from `@filter-enginez/core/keyboard/browser` is what the React hook now
	 * wraps too, so Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y behave identically here. It is wired
	 * beside the buttons whose tooltips advertise it, which is the only arrangement that cannot drift
	 * apart — a label promising a shortcut some other file is responsible for is how React ended up
	 * advertising one on two routes that did not have it.
	 *
	 * ### Why they are disabled rather than absent
	 *
	 * Both buttons render always and go `disabled` when there is nothing to step to — which, with an
	 * empty action log, is the state a first-time visitor sees. A control that vanishes when it cannot
	 * act teaches nobody that time travel exists, and it reflows the header every time the log empties.
	 */

	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { attachUndoRedoKeyboard } from '@filter-enginez/core/keyboard/browser';
	import { createEngineStores } from '@filter-enginez/svelte-signals';

	const {
		engine,
		isDevtoolsOpen,
		markBusy,
		onToggleDevtools,
	}: {
		engine: SignalsEngine<TItem>;
		/** Whether the devtools panel is open — drives the toggle's pressed state. */
		isDevtoolsOpen: boolean;
		/**
		 * Bump the dataset's busy version, so the computing indicator lights on the same frame.
		 *
		 * @remarks
		 * A prop because the busy tracker is per-dataset. Undo and redo are engine mutations like any
		 * other — an undo over 130k rows costs exactly what the filter it reverses cost — and skipping
		 * this makes the app look frozen for the duration rather than busy.
		 */
		markBusy: () => void;
		/** Flip the panel open or closed. */
		onToggleDevtools: () => void;
	} = $props();

	// The engine is a prop that is never reassigned — the view renders this only after boot resolves.
	// svelte-ignore state_referenced_locally
	const { lastChange } = createEngineStores(engine);

	// svelte-ignore state_referenced_locally
	// `devtools` is a public core API but is not on the narrowed core surface this component is typed
	// against, so it is reached through an explicit structural cast — as in `<DevtoolsPanel>`.
	const devtools = (engine.core as unknown as { devtools: unknown }).devtools as {
		canRedo: boolean;
		canUndo: boolean;
		redo: () => void;
		undo: () => void;
	};

	/**
	 * Whether there is a step behind the cursor.
	 *
	 * @remarks
	 * `canUndo` is a plain getter on a mutable object, so it is not reactive on its own. Reading
	 * `$lastChange` first is what re-evaluates it — the same load-bearing "pointless" read
	 * `<DevtoolsPanel>` uses for the log itself.
	 */
	const canUndo = $derived.by((): boolean => {
		void $lastChange;

		return devtools.canUndo;
	});

	/** Whether there is a step ahead of the cursor. */
	const canRedo = $derived.by((): boolean => {
		void $lastChange;

		return devtools.canRedo;
	});

	// The attach function returns its own teardown, which is exactly what `$effect` wants back — so
	// the binding is one line and cannot leak a duplicate listener across a remount.
	$effect(() => attachUndoRedoKeyboard(devtools));

	/** Step one action back, marking busy first so the indicator lights on the click's own frame. */
	function handleUndo(): void {
		if (!canUndo) {
			return;
		}
		markBusy();
		devtools.undo();
	}

	/** Step one action forward. */
	function handleRedo(): void {
		if (!canRedo) {
			return;
		}
		markBusy();
		devtools.redo();
	}
</script>

<button
	type="button"
	class="fe-icon-button"
	title="Undo (Cmd/Ctrl+Z)"
	aria-label="Undo (Cmd/Ctrl+Z)"
	disabled={!canUndo}
	onclick={handleUndo}
>
	<svg
		viewBox="0 0 24 24"
		width="18"
		height="18"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M9 14 4 9l5-5" />
		<path d="M4 9h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3" />
	</svg>
</button>

<button
	type="button"
	class="fe-icon-button"
	title="Redo (Cmd/Ctrl+Shift+Z)"
	aria-label="Redo (Cmd/Ctrl+Shift+Z)"
	disabled={!canRedo}
	onclick={handleRedo}
>
	<svg
		viewBox="0 0 24 24"
		width="18"
		height="18"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="m15 14 5-5-5-5" />
		<path d="M20 9H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3" />
	</svg>
</button>

<!-- These three are one cluster, but stepping and inspecting are different jobs. -->
<span aria-hidden="true" class="fe-icon-button-divider"></span>

<!-- The toggle is CYAN when open, per the dual-accent contract: it names a surface you are looking at
     (identity), not work the engine is doing (which would be phosphor). -->
<button
	type="button"
	class="fe-icon-button fe-icon-button--raised"
	title={isDevtoolsOpen ? 'Hide devtools' : 'Show devtools (action log + time-travel)'}
	aria-label={isDevtoolsOpen ? 'Hide devtools' : 'Show devtools'}
	aria-pressed={isDevtoolsOpen}
	onclick={onToggleDevtools}
>
	<!-- A terminal prompt, `>_` — the most legible eight-pixel shorthand for "developer surface"
	     available, and it needs no text label beside it. -->
	<svg
		viewBox="0 0 24 24"
		width="18"
		height="18"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="m5 8 4 4-4 4" />
		<path d="M13 16h6" />
	</svg>
</button>
