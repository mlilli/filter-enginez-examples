/**
 * Tests for `useUrlSyncBindings`, through the real `<FilterEngineUrlSync>` it feeds.
 *
 * @remarks
 * ### The race these reproduce
 *
 * The React apps navigate inside transitions, so React can commit the location of one `?f=` write
 * after the sync has made the next one. The sync then sees the OLDER of its own two strings in the
 * URL and, remembering only the newer, loads it: the change in between is dropped. The cases drive
 * that state directly: two writes, then a navigation back to the first one's `?f=` — exactly what the
 * sync sees when the first write's location commits last. The unguarded case shows the drop; the
 * guarded one shows the newer state kept.
 *
 * `debounceMs={0}` makes each engine change write at once, and the engine is the synchronous core, so
 * a write is one `exportConfig` away.
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, type NavigateFunction, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkSerializer } from './linkSerializer.js';
import { setUrlFormat } from './urlFormatStore.js';
import { useUrlSyncBindings } from './useUrlSyncBindings.js';

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

/** What the probe hands back from inside the router. */
interface RouterProbe {
	/** The router's navigate. */
	readonly navigate: NavigateFunction | null;
	/** The current `?f=`, or `null`. */
	readonly param: string | null;
}

/**
 * Report the router's navigate and current `?f=` to a test after every render.
 *
 * @param props - Where to report.
 * @returns Nothing rendered.
 */
const Probe = ({ onReport }: { readonly onReport: (report: RouterProbe) => void }): null => {
	const navigate = useNavigate();
	const param = new URLSearchParams(useLocation().search).get('f');

	useEffect(() => {
		onReport({ navigate, param });
	});

	return null;
};

/**
 * The sync as the React apps mount it, through the hook.
 *
 * @param props - The engine core.
 * @returns The sync.
 */
const GuardedSync = ({ core }: { readonly core: Core }): React.ReactElement => {
	const urlSync = useUrlSyncBindings(core);

	return <FilterEngineUrlSync engine={urlSync.engine} serializer={urlSync.serializer} debounceMs={0} />;
};

/**
 * The sync with the plain engine and serializer, as the apps would mount it without the hook.
 *
 * @param props - The engine core.
 * @returns The sync.
 */
const PlainSync = ({ core }: { readonly core: Core }): React.ReactElement => (
	<FilterEngineUrlSync engine={core} serializer={createLinkSerializer('human-readable')} debounceMs={0} />
);

/**
 * Mount a sync over a fresh engine on `/wine`, make two filter changes, then land the router on the
 * first change's `?f=` as a late-committed transition would.
 *
 * @param Sync - Which sync to mount.
 * @returns The engine after the replay.
 */
async function replayLateCommit(Sync: (props: { readonly core: Core }) => React.ReactElement): Promise<Core> {
	const core = createFilterEngine<Row>({ sourceData: ROWS });
	let probe: RouterProbe = { navigate: null, param: null };

	render(
		<MemoryRouter initialEntries={['/wine']}>
			<Sync core={core} />
			<Probe
				onReport={(report) => {
					probe = report;
				}}
			/>
		</MemoryRouter>,
	);

	await act(async () => {
		core.addRule('color', inSet<string>('color', ['red']));
		await Promise.resolve();
	});
	const first = probe.param;

	await act(async () => {
		core.addRule('color-value', inSet<string>('color', ['red', 'white']));
		await Promise.resolve();
	});

	expect(first).not.toBeNull();
	expect(probe.param).not.toBe(first);

	await act(async () => {
		await probe.navigate?.(`/wine?${new URLSearchParams({ f: first ?? '' }).toString()}`, { replace: true });
		await Promise.resolve();
	});

	return core;
}

describe('useUrlSyncBindings', () => {
	it('reproduces the race without the guard: the sync loads its own older write and drops the newer rule', async () => {
		const core = await replayLateCommit(PlainSync);

		expect(core.getRule('color-value')).toBeUndefined();
	});

	it('keeps the newer state when the sync meets its own older write', async () => {
		const core = await replayLateCommit(GuardedSync);

		expect(core.getRule('color')).toBeDefined();
		expect(core.getRule('color-value')).toBeDefined();
	});

	it('still loads a link from outside', () => {
		const core = createFilterEngine<Row>({ sourceData: ROWS });
		const donor = createFilterEngine<Row>({ sourceData: ROWS });

		donor.addRule('color', inSet<string>('color', ['white']));
		const link = createLinkSerializer('human-readable').encode(donor.exportConfig());

		render(
			<MemoryRouter initialEntries={[`/wine?${new URLSearchParams({ f: link }).toString()}`]}>
				<GuardedSync core={core} />
			</MemoryRouter>,
		);

		expect(core.getRule('color')).toBeDefined();
		expect(core.getResultCount()).toBe(1);
	});

	it('keeps the engine and the remembered writes across renders and a format switch', () => {
		const core = createFilterEngine<Row>({ sourceData: ROWS });
		const { rerender, result } = renderHook(() => useUrlSyncBindings(core));
		const { engine } = result.current;
		const written = result.current.serializer.encode(core.exportConfig());

		act(() => {
			setUrlFormat('compact');
		});
		rerender();

		expect(result.current.engine).toBe(engine);
		expect(result.current.serializer.encode(core.exportConfig())).not.toBe(written);

		// A write made under the old format is still the sync's own.
		core.addRule('color', inSet<string>('color', ['red']));
		result.current.engine.loadConfig(result.current.serializer.decode(written));

		expect(core.getRule('color')).toBeDefined();
	});
});
