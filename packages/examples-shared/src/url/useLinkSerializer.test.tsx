/**
 * Tests for `useLinkSerializer`, through the real `<FilterEngineUrlSync>` the React routes feed it to.
 *
 * @remarks
 * ### The race the React apps meet
 *
 * Both React apps navigate inside transitions (`<BrowserRouter>`'s default), so React can render the
 * location of one `?f=` write after the sync has already made the next one. The sync must recognize
 * that late location as its own and leave the engine alone, while still loading every navigation the
 * user makes, Back and Forward to a state it wrote itself included. The cases mount the sync exactly
 * as the routes do — the engine core as it is, the serializer from this hook — under a router whose
 * navigations render only when a case commits them, in the order the case chooses
 * ({@link renderWithDeferredRouter}).
 *
 * `debounceMs={0}` makes each engine change write at once, except in the case that is about the
 * debounce; the engine is the synchronous core, so a write is one `exportConfig` away.
 *
 * @packageDocumentation
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { createPath, NavigationType, type Navigator, parsePath, Router, type To } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkSerializer } from './linkSerializer.js';
import { setUrlFormat } from './urlFormatStore.js';
import { useLinkSerializer } from './useLinkSerializer.js';

afterEach(() => {
	cleanup();
	setUrlFormat('human-readable');
});

/** A record the engine filters. */
interface Row {
	/** The faceted field. */
	readonly color: string;
}

/** Three rows, one per color. */
const ROWS: readonly Row[] = [{ color: 'red' }, { color: 'white' }, { color: 'rosé' }];

/** The synchronous engine core. */
type Core = ReturnType<typeof createFilterEngine<Row>>;

/** One location the router can show. */
interface RouterView {
	/** The location, as a path string (`/wine?f=…`). */
	readonly path: string;
	/** How it was reached. */
	readonly type: NavigationType;
}

/** Props for {@link DeferredRouter}. */
interface DeferredRouterProps {
	/** The routed tree. */
	readonly children: ReactNode;
	/** The location shown first. */
	readonly initialView: RouterView;
	/** The navigator the component under test navigates through. */
	readonly navigator: Navigator;
	/** Receives the setter that shows a location, once mounted. */
	readonly onMount: (show: (view: RouterView) => void) => void;
}

/**
 * A router showing whichever location the test last handed it.
 *
 * @param props - The tree, the first location, the navigator and the mount callback.
 * @returns The router element.
 */
const DeferredRouter = ({ children, initialView, navigator, onMount }: DeferredRouterProps): ReactElement => {
	const [view, setView] = useState<RouterView>(initialView);

	useEffect(() => {
		onMount(setView);
	}, [onMount]);

	return <Router location={parsePath(view.path)} navigationType={view.type} navigator={navigator}>{children}</Router>;
};

/** The test's handle on a mounted {@link renderWithDeferredRouter}. */
interface DeferredRouterHandle {
	/** Navigate as a link would: recorded in history and rendered at once. */
	readonly appNavigate: (path: string, type: NavigationType.Push | NavigationType.Replace) => void;
	/** Go back one history entry, as the browser's Back button does (a `POP`). */
	readonly back: () => void;
	/**
	 * Render a queued navigation now. Call inside `act`.
	 *
	 * @param position - Its position in the queue, oldest first.
	 */
	readonly commit: (position: number) => void;
	/** Go forward one history entry, as the browser's Forward button does (a `POP`). */
	readonly forward: () => void;
	/** The rendered location's `?f=`, or `null`. */
	readonly param: () => string | null;
	/** How many of the component's navigations are waiting to render. */
	readonly queuedCount: () => number;
}

/**
 * Mount `ui` under a router that writes history when the component navigates, as a browser router
 * writes the address bar, but renders the location only when the test commits it.
 *
 * @remarks
 * Two quick navigations made inside a transition can reach the screen in either order; this lets a
 * case put them there in the order the race produces. Back, Forward and link navigations render at
 * once, as a user's do.
 *
 * @param ui - The element under test.
 * @param initialPath - The first history entry.
 * @returns The handle.
 */
function renderWithDeferredRouter(ui: ReactElement, initialPath: string): DeferredRouterHandle {
	const history: string[] = [initialPath];
	const queue: RouterView[] = [];
	let index = 0;
	let rendered: RouterView = { path: initialPath, type: NavigationType.Pop };
	let setView: (view: RouterView) => void = () => undefined;
	const show = (next: RouterView): void => {
		rendered = next;
		setView(next);
	};

	const record = (path: string, type: NavigationType): void => {
		if (type === NavigationType.Push) {
			history.splice(index + 1, history.length, path);
			index += 1;
		} else {
			history[index] = path;
		}
	};
	const enqueue = (to: To, type: NavigationType): void => {
		const path = typeof to === 'string' ? to : createPath(to);

		record(path, type);
		queue.push({ path, type });
	};
	const navigator: Navigator = {
		createHref: (to: To): string => (typeof to === 'string' ? to : createPath(to)),
		go: (): void => undefined,
		push: (to: To): void => {
			enqueue(to, NavigationType.Push);
		},
		replace: (to: To): void => {
			enqueue(to, NavigationType.Replace);
		},
	};
	const step = (delta: number): void => {
		index += delta;
		show({ path: history[index] ?? initialPath, type: NavigationType.Pop });
	};

	const onMount = (setter: (view: RouterView) => void): void => {
		setView = setter;
	};

	render(
		<DeferredRouter initialView={rendered} navigator={navigator} onMount={onMount}>
			{ui}
		</DeferredRouter>,
	);

	return {
		appNavigate: (path, type): void => {
			record(path, type);
			show({ path, type });
		},
		back: (): void => {
			step(-1);
		},
		commit: (position): void => {
			const [navigation] = queue.splice(position, 1);

			if (navigation === undefined) {
				throw new Error(`No queued navigation at ${String(position)}`);
			}
			show(navigation);
		},
		forward: (): void => {
			step(1);
		},
		param: (): string | null => new URLSearchParams(parsePath(rendered.path).search ?? '').get('f'),
		queuedCount: (): number => queue.length,
	};
}

/**
 * The sync as the React routes mount it.
 *
 * @param props - The engine core, and the write debounce.
 * @returns The sync.
 */
const RouteSync = ({ core, debounceMs = 0 }: { readonly core: Core; readonly debounceMs?: number }): ReactElement => (
	<FilterEngineUrlSync engine={core} serializer={useLinkSerializer()} debounceMs={debounceMs} />
);

/**
 * The route around the sync, re-rendered whenever the test calls the trigger it hands `onMount`.
 *
 * @param props - The engine core, and the mount callback.
 * @returns The sync, with a 20 ms debounce, in an element that shows the render count.
 */
const RerenderingRoute = ({ core, onMount }: { readonly core: Core; readonly onMount: (rerender: () => void) => void }): ReactElement => {
	const [renders, setRenders] = useState(0);

	useEffect(() => {
		onMount(() => {
			setRenders((count) => count + 1);
		});
	}, [onMount]);

	return (
		<div data-renders={renders}>
			<RouteSync core={core} debounceMs={20} />
		</div>
	);
};

/**
 * Mount the sync over a fresh engine on `/wine`.
 *
 * @param debounceMs - The write debounce.
 * @returns The engine and the router handle.
 */
function mount(debounceMs = 0): { readonly core: Core; readonly router: DeferredRouterHandle } {
	const core = createFilterEngine<Row>({ sourceData: ROWS });

	return { core, router: renderWithDeferredRouter(<RouteSync core={core} debounceMs={debounceMs} />, '/wine') };
}

/**
 * Add a color rule, which makes the sync write (and queue) one navigation.
 *
 * @param core - The engine.
 * @param id - The rule id.
 * @param colors - The colors it admits.
 */
function addColorRule(core: Core, id: string, colors: readonly string[]): void {
	act(() => {
		core.addRule(id, inSet<string>('color', [...colors]));
	});
}

/**
 * Render a queued navigation.
 *
 * @param router - The router handle.
 * @param position - Its position in the queue.
 */
function commit(router: DeferredRouterHandle, position: number): void {
	act(() => {
		router.commit(position);
	});
}

describe('useLinkSerializer, through <FilterEngineUrlSync>', () => {
	it('keeps the newer state when an older write’s location renders after a newer one', () => {
		const { core, router } = mount();

		addColorRule(core, 'color', ['red']);
		addColorRule(core, 'color-value', ['red', 'white']);
		expect(router.queuedCount()).toBe(2);

		// The newer write renders first, then the older one, late.
		commit(router, 1);
		commit(router, 0);

		expect(core.getRule('color')).toBeDefined();
		expect(core.getRule('color-value')).toBeDefined();
	});

	it('loads Back to a state it wrote earlier, and Forward to the newer one', () => {
		const { core, router } = mount();

		addColorRule(core, 'color', ['red']);
		commit(router, 0);
		const earlier = router.param();

		// The routes write with `replace`, so a second history entry for the route comes from outside
		// the sync; here, a link to the same location.
		act(() => {
			router.appNavigate(`/wine?${new URLSearchParams({ f: earlier ?? '' }).toString()}`, NavigationType.Push);
		});
		addColorRule(core, 'color-value', ['white']);
		commit(router, 0);
		const newer = router.param();

		expect(earlier).not.toBeNull();
		expect(newer).not.toBe(earlier);

		act(() => {
			router.back();
		});

		expect(router.param()).toBe(earlier);
		expect(core.getRule('color')).toBeDefined();
		expect(core.getRule('color-value')).toBeUndefined();
		expect(core.getResultCount()).toBe(1);

		act(() => {
			router.forward();
		});

		expect(router.param()).toBe(newer);
		expect(core.getRule('color-value')).toBeDefined();
	});

	it('loads a link from outside', () => {
		const { core, router } = mount();
		const donor = createFilterEngine<Row>({ sourceData: ROWS });

		donor.addRule('color', inSet<string>('color', ['white']));
		const link = createLinkSerializer('human-readable').encode(donor.exportConfig());

		act(() => {
			router.appNavigate(`/wine?${new URLSearchParams({ f: link }).toString()}`, NavigationType.Replace);
		});

		expect(core.getRule('color')).toBeDefined();
		expect(core.getResultCount()).toBe(1);
	});

	it('keeps a write waiting out its debounce through a re-render of the route', async () => {
		const core = createFilterEngine<Row>({ sourceData: ROWS });
		let rerenderRoute: () => void = () => undefined;
		const router = renderWithDeferredRouter(
			<RerenderingRoute
				core={core}
				onMount={(rerender) => {
					rerenderRoute = rerender;
				}}
			/>,
			'/wine',
		);

		addColorRule(core, 'color', ['red']);
		act(() => {
			rerenderRoute();
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 40));
		});

		expect(router.queuedCount()).toBe(1);
	});

	it('returns the same serializer across renders, and the chosen format’s after a switch', () => {
		const core = createFilterEngine<Row>({ sourceData: ROWS });

		core.addRule('color', inSet<string>('color', ['red']));
		const { rerender, result } = renderHook(() => useLinkSerializer());
		const initial = result.current;

		rerender();
		expect(result.current).toBe(initial);

		act(() => {
			setUrlFormat('compact');
		});
		rerender();

		expect(result.current).not.toBe(initial);
		expect(result.current.encode(core.exportConfig())).toBe(createLinkSerializer('compact').encode(core.exportConfig()));
		expect(result.current.encode(core.exportConfig())).not.toBe(initial.encode(core.exportConfig()));
	});
});
