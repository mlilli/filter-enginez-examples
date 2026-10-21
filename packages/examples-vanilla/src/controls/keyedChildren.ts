/**
 * `controls/keyedChildren` — the in-place half of every list-shaped control: reuse one element per
 * key, and move only the elements that have to move.
 *
 * @remarks
 * ## Why the controls do not simply rebuild
 *
 * Replacing a control's children detaches the element that has keyboard focus, and a detached
 * element drops it: the focus falls back to `<body>`, so a keyboard user who toggled a chip — or
 * whose chip the engine's next settle repainted — has to tab back from the top of the page. The
 * frameworks keep their nodes across a re-render by key (`{#each … (value)}`, `:key`, `track`), and
 * this module is the framework-less equivalent: a {@link KeyedParts} cache hands back the SAME
 * element for a key on every update, and {@link reconcileChildren} inserts and removes around the
 * elements that stay rather than re-appending them.
 *
 * @packageDocumentation
 */

/** What a keyed cache holds per key: the key itself, the rendered element, and any handles on it. */
export interface KeyedPart<K> {
	/** The element this key renders as. */
	readonly element: Element;
	/** The key it was built for. */
	readonly key: K;
}

/** One part per key, built on first use and dropped when its key is no longer rendered. */
export interface KeyedParts<K, P extends KeyedPart<K>> {
	/**
	 * The parts for `keys`, in order — the cached part where one exists, a new one otherwise. Parts
	 * whose key is absent from `keys` are forgotten.
	 */
	readonly resolve: (keys: readonly K[]) => readonly P[];
	/** Forget every part, so the next {@link KeyedParts.resolve} builds afresh. */
	readonly reset: () => void;
}

/**
 * Build a keyed part cache.
 *
 * @typeParam K - The key type.
 * @typeParam P - The part type.
 * @param create - Builds the part for a key the first time it is rendered.
 * @returns The cache.
 */
export function createKeyedParts<K, P extends KeyedPart<K>>(create: (key: K) => P): KeyedParts<K, P> {
	let byKey = new Map<K, P>();

	return {
		reset: () => {
			byKey = new Map<K, P>();
		},
		resolve: (keys) => {
			const next = new Map<K, P>();
			const parts = keys.map((key) => {
				const part = byKey.get(key) ?? create(key);

				next.set(key, part);

				return part;
			});

			byKey = next;

			return parts;
		},
	};
}

/**
 * Make `parent`'s element children exactly `desired`, in order, without detaching any element that
 * is already in the right place.
 *
 * @remarks
 * Elements not in `desired` are removed first; then one pass inserts each desired element before the
 * cursor unless it already IS the cursor. Expanding a tree branch or a vocabulary gaining a chip is
 * therefore a handful of inserts, and the focused row is never touched.
 *
 * @param parent - The container.
 * @param desired - Its children, in order.
 */
export function reconcileChildren(parent: Element, desired: readonly Element[]): void {
	const keep = new Set<Element>(desired);

	for (const child of [...parent.children]) {
		if (!keep.has(child)) {
			child.remove();
		}
	}

	let cursor = parent.firstElementChild;

	for (const element of desired) {
		if (element === cursor) {
			cursor = element.nextElementSibling;
		} else {
			parent.insertBefore(element, cursor);
		}
	}
}

/**
 * Set an attribute, or remove it when the value is `null`.
 *
 * @param element - The element.
 * @param name - The attribute.
 * @param value - Its value, or `null` for "absent".
 */
export function setOptionalAttribute(element: Element, name: string, value: string | null): void {
	if (value === null) {
		element.removeAttribute(name);
	} else {
		element.setAttribute(name, value);
	}
}
