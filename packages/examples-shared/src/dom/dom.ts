/**
 * `@filter-enginez/examples-shared/dom` — the tiny element-construction helpers the framework-free
 * code uses instead of a template language.
 *
 * @remarks
 * The framework verticals get JSX / a `.svelte` template / a `.vue` template. Framework-less, the
 * equivalent is a typed `createElement` wrapper: it keeps the render functions declarative and
 * readable without pulling in a view library. Roughly the surface a hyperscript helper gives you, in
 * ~40 lines and zero dependencies.
 *
 * Two consumers build DOM by hand and share this one copy: the framework-free demo app
 * (`examples-vanilla`) and the how-it-works page on the landing site (`packages/site`), whose figures
 * and benchmark widget started life in that app. React-free and import-free, pinned by
 * `tests/tooling/reactFreeSubpaths.test.ts`.
 *
 * @packageDocumentation
 */

/** Anything acceptable as a child: a node, a string (becomes a text node), or nothing. */
export type Child = Node | string | false | null | undefined;

/** Attributes / properties accepted by {@link el}. */
export interface ElementOptions {
	/** `class` attribute (accepts a pre-joined string). */
	readonly className?: string;
	/** Text content — a convenience for the common single-text-child case. */
	readonly text?: string;
	/** Plain attributes set via `setAttribute` (`aria-*`, `role`, `type`, `href`, …). */
	readonly attrs?: Readonly<Record<string, boolean | number | string | null | undefined>>;
	/** Inline styles set on `element.style` (camelCase keys, as in `CSSStyleDeclaration`). */
	readonly style?: Readonly<Record<string, string>>;
	/** Event listeners keyed by event name. */
	readonly on?: Readonly<Record<string, EventListener>>;
	/** Child nodes appended in order; falsy entries are skipped (so `cond && node` works). */
	readonly children?: readonly Child[];
}

/**
 * Create an element with attributes, listeners, and children in one expression.
 *
 * @param tag - The tag name to create.
 * @param options - Attributes / text / styles / listeners / children.
 * @returns The constructed element.
 *
 * @example
 * ```ts
 * el('button', {
 *   className: 'fe-chip',
 *   attrs: { type: 'button', 'aria-pressed': isOn },
 *   on: { click: () => toggle() },
 *   children: [label, el('span', { className: 'fe-chip__count', text: String(count) })],
 * });
 * ```
 */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	const { attrs, children, className, on, style, text } = options;

	if (className !== undefined) {
		element.className = className;
	}
	if (text !== undefined) {
		element.textContent = text;
	}
	if (attrs !== undefined) {
		for (const [name, value] of Object.entries(attrs)) {
			// `null` / `undefined` mean "omit"; booleans render as "true"/"false" so ARIA states work.
			if (value !== null && value !== undefined) {
				element.setAttribute(name, String(value));
			}
		}
	}
	if (style !== undefined) {
		for (const [property, value] of Object.entries(style)) {
			element.style.setProperty(toCssProperty(property), value);
		}
	}
	if (on !== undefined) {
		for (const [type, listener] of Object.entries(on)) {
			element.addEventListener(type, listener);
		}
	}
	if (children !== undefined) {
		append(element, children);
	}

	return element;
}

/**
 * Append children to a parent, skipping falsy entries and wrapping strings as text nodes.
 *
 * @param parent - The element to append into.
 * @param children - The children to append.
 */
export function append(parent: HTMLElement, children: readonly Child[]): void {
	for (const child of children) {
		if (child === null || child === undefined || child === false) {
			continue;
		}
		parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
	}
}

/**
 * Show or hide an element.
 *
 * @remarks
 * Deliberately NOT the `hidden` attribute. `[hidden] { display: none }` is a plain UA rule, so any
 * authored `display` on the element's class beats it — and most of the `fe-*` families set one
 * (`.fe-active-filters__empty { display: flex }`, for example), which silently defeats `hidden`.
 * Setting the inline style wins the cascade regardless; clearing it back to `''` restores whatever
 * the stylesheet says rather than hard-coding a display mode.
 *
 * @param element - The element to toggle.
 * @param isHidden - `true` to hide it.
 */
export function setHidden(element: HTMLElement, isHidden: boolean): void {
	element.style.display = isHidden ? 'none' : '';
}

/**
 * Create an SVG element (the figures + loaders need the SVG namespace, which `createElement` can't
 * produce).
 *
 * @param tag - The SVG tag name.
 * @param attrs - Attributes applied verbatim via `setAttribute`.
 * @param children - Child SVG nodes.
 * @returns The constructed SVG element.
 */
export function svg(
	tag: string,
	attrs: Readonly<Record<string, number | string>> = {},
	children: readonly Node[] = [],
): SVGElement {
	const element = document.createElementNS('http://www.w3.org/2000/svg', tag);

	for (const [name, value] of Object.entries(attrs)) {
		element.setAttribute(name, String(value));
	}
	for (const child of children) {
		element.append(child);
	}

	return element;
}

/**
 * Convert a camelCase style key to its CSS property name (`animationDelay` → `animation-delay`).
 * Keys that are already custom properties (`--foo`) pass through untouched.
 *
 * @internal
 */
function toCssProperty(key: string): string {
	return key.startsWith('--') ? key : key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}
