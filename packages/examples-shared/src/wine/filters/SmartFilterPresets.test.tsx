/**
 * Rendering tests for `<SmartFilterPresets />`: the preset chips follow the engine's expression
 * whenever it changes from outside, the panel's own click still paints at once, and a preset REPLACES
 * the manual filters (and marks the action busy) the way it does in every other vertical.
 *
 * The row reads its selection from the panel (`smartFilterSelection.ts`), so each render wraps it in
 * the same context `<WineFilterPanel>` provides, and nothing else of the panel.
 *
 * @remarks
 * **The restore runs through the real `<FilterEngineUrlSync>`, mounted beside the panel**, exactly as
 * both React apps' `DatasetView` mounts them. The sync restores `?f` in an effect, and effects run only
 * after the whole tree has rendered, so the panel always renders before the restore: a selection read
 * once at mount is the pre-restore one. Driving the real component keeps that ordering honest rather
 * than restating it in a fake.
 *
 * **The worker tier is simulated by holding the engine's writes back** ({@link withDeferredWrites}):
 * `setExpression` and `loadConfig` are queued and delivered on demand, so the expression signal lands
 * a round trip after the call, the way it does over the worker bridge.
 */

import { and, createFilterEngine, inSet, numCompare } from '@filter-enginez/core';
import { type Wine, wines } from '@filter-enginez/mock-data/wine';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkSerializer } from '../../url/linkSerializer.js';
import { captureCurrentVersion, getIsEngineBusy, markResolvedAtLeast } from '../engineBusy.js';
import { buildSmartFilterExpression, deriveSelectedPresetIds } from '../smartFilters.js';
import { SmartFilterPresets } from './SmartFilterPresets.js';
import { SmartFilterSelectionContext, useSmartFilterSelectionState } from './smartFilterSelection.js';

// No auto-cleanup in this workspace (no `globals: true`), so trees would otherwise accumulate.
afterEach(cleanup);

/** The synchronous wine engine core. */
type WineCore = ReturnType<typeof createFilterEngine<Wine>>;

/** A small deterministic slice; the presets only need a real-shaped corpus to evaluate against. */
const CORPUS: readonly Wine[] = wines.slice(0, 400);

/** The `?f=` codec both React apps hand `<FilterEngineUrlSync>`. */
const SERIALIZER = createLinkSerializer('human-readable');

/**
 * The `?f=` value a vertical writes for a preset selection.
 *
 * @param presetIds - The presets to select.
 * @returns The encoded engine state.
 */
function linkFor(presetIds: readonly string[]): string {
	const donor = createFilterEngine<Wine>({ sourceData: CORPUS });

	donor.setExpression(buildSmartFilterExpression(presetIds));

	return SERIALIZER.encode(donor.exportConfig());
}

/**
 * The `?f=` value engine 0.0.3 wrote for the same selection: its inline rules carry no `inline` mark
 * and are named only by the reserved `__inline_<n>` ids the expression references.
 *
 * @param presetIds - The presets to select.
 * @returns The encoded engine state, without the marks.
 */
function legacyLinkFor(presetIds: readonly string[]): string {
	const donor = createFilterEngine<Wine>({ sourceData: CORPUS });

	donor.setExpression(buildSmartFilterExpression(presetIds));

	const config = donor.exportConfig();

	return SERIALIZER.encode({ ...config, rules: config.rules.map(({ id, rule }) => ({ id, rule })) });
}

/**
 * A core whose expression writes arrive late: `setExpression` and `loadConfig` are queued until
 * `deliver` runs them, the way a worker-backed engine answers a round trip after the call.
 *
 * @param core - The real core the writes eventually reach.
 * @returns The deferring core, and the function that delivers every queued write.
 */
function withDeferredWrites(core: WineCore): { readonly deferred: WineCore; readonly deliver: () => void; } {
	const queued: (() => void)[] = [];
	const deferred = new Proxy(core, {
		get(target, property): unknown {
			if (property === 'setExpression') {
				return (...args: Parameters<WineCore['setExpression']>): void => {
					queued.push(() => {
						target.setExpression(...args);
					});
				};
			}
			if (property === 'loadConfig') {
				return (...args: Parameters<WineCore['loadConfig']>): void => {
					queued.push(() => {
						target.loadConfig(...args);
					});
				};
			}
			const value: unknown = Reflect.get(target, property, target);

			return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
		},
	});

	return {
		deferred,
		deliver: () => {
			act(() => {
				for (const write of queued.splice(0)) {
					write();
				}
			});
		},
	};
}

/**
 * The preset row with the selection `<WineFilterPanel>` would provide it, and nothing else of the panel.
 *
 * @returns The row inside its selection context.
 */
const PresetsInPanelContext = (): React.ReactElement => {
	const selection = useSmartFilterSelectionState();

	return (
		<SmartFilterSelectionContext value={selection}>
			<SmartFilterPresets />
		</SmartFilterSelectionContext>
	);
};

/**
 * Mount the presets beside the real URL sync, at `/wine` with an optional `?f=`.
 *
 * @param options - The core to provide (a real one by default) and the `?f=` to restore.
 * @returns The core the panel writes through.
 */
function renderPresets(options: { readonly core?: WineCore; readonly link?: string; } = {}): WineCore {
	const core = options.core ?? createFilterEngine<Wine>({ sourceData: CORPUS });
	const engine = createSignalsEngine(core);
	const entry = options.link === undefined ? '/wine' : `/wine?${new URLSearchParams({ f: options.link }).toString()}`;

	render(
		<MemoryRouter initialEntries={[entry]}>
			<FilterEngineProvider engine={engine}>
				<FilterEngineUrlSync engine={engine.core} serializer={SERIALIZER} debounceMs={0} />
				<PresetsInPanelContext />
			</FilterEngineProvider>
		</MemoryRouter>,
	);

	return core;
}

/**
 * A preset chip by its visible label.
 *
 * @param label - The chip label, e.g. `Cellar picks`.
 * @returns The chip button.
 */
const chip = (label: string): HTMLElement => screen.getByRole('button', { name: label });

/**
 * The labels of every lit preset chip, in display order.
 *
 * @returns The pressed chips' labels.
 */
function pressedLabels(): readonly string[] {
	return screen
		.getAllByRole('button', { pressed: true })
		.map((button) => button.textContent.trim());
}

/** The "Match any (OR)" mode checkbox. */
const matchAny = (): HTMLInputElement => screen.getByRole('checkbox', { name: 'Match any (OR)' });

describe('<SmartFilterPresets />', () => {
	it('lights the preset a `?f` link restores in the same commit that mounts the panel', () => {
		renderPresets({ link: linkFor(['cellar-picks']) });

		expect(chip('Cellar picks').getAttribute('aria-pressed')).toBe('true');
		expect(pressedLabels()).toEqual(['Cellar picks']);
		expect(matchAny().checked).toBe(false);
	});

	it('restores a multi-preset `or` with "Match any (OR)" switched on', () => {
		renderPresets({ link: linkFor(['bold-reds', 'cellar-picks']) });

		expect(pressedLabels()).toEqual(['Bold reds', 'Cellar picks']);
		expect(matchAny().checked).toBe(true);
	});

	it('follows every external expression change after mount, whoever makes it', () => {
		const core = renderPresets();

		fireEvent.click(chip('Cellar picks'));
		expect(pressedLabels()).toEqual(['Cellar picks']);

		// Time travel or another component landing on a different preset.
		act(() => {
			core.setExpression(buildSmartFilterExpression(['pinot-any']));
		});
		expect(pressedLabels()).toEqual(['Pinot']);

		// An expression no preset builds: nothing the chips could reproduce, so nothing is lit.
		act(() => {
			core.setExpression(and(numCompare('points', { op: '>=', value: 99 })));
		});
		expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);

		// Back to a preset, then the header's "Clear all".
		act(() => {
			core.setExpression(buildSmartFilterExpression(['crisp-whites']));
		});
		expect(pressedLabels()).toEqual(['Crisp whites']);
		act(() => {
			core.setExpression(null);
		});
		expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);
	});

	it('keeps "Match any (OR)" on when a user in OR mode deselects down to one preset', () => {
		renderPresets({ link: linkFor(['bold-reds', 'cellar-picks']) });

		fireEvent.click(chip('Bold reds'));

		expect(pressedLabels()).toEqual(['Cellar picks']);
		expect(matchAny().checked).toBe(true);
	});

	describe('on a worker-style engine, whose expression lands a round trip late', () => {
		it('lights the restored preset once the late restore arrives', () => {
			const { deferred, deliver } = withDeferredWrites(createFilterEngine<Wine>({ sourceData: CORPUS }));

			renderPresets({ core: deferred, link: linkFor(['cellar-picks']) });
			// The restore is still in flight: nothing can be lit yet.
			expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);

			deliver();
			expect(pressedLabels()).toEqual(['Cellar picks']);
		});

		it('paints its own click at once and keeps it through the echo', () => {
			const { deferred, deliver } = withDeferredWrites(createFilterEngine<Wine>({ sourceData: CORPUS }));
			const core = renderPresets({ core: deferred });

			fireEvent.click(chip('Cellar picks'));
			// Lit before the engine has the expression: the click painted locally.
			expect(deriveSelectedPresetIds(core.getExpression())).toEqual([]);
			expect(pressedLabels()).toEqual(['Cellar picks']);

			deliver();
			expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['cellar-picks']);
			expect(pressedLabels()).toEqual(['Cellar picks']);
		});

		it('keeps an OR selection picked out of table order through the echo', () => {
			const { deferred, deliver } = withDeferredWrites(createFilterEngine<Wine>({ sourceData: CORPUS }));
			const core = renderPresets({ core: deferred });

			fireEvent.click(matchAny());
			deliver();
			fireEvent.click(chip('Cellar picks'));
			deliver();
			fireEvent.click(chip('Bold reds'));
			expect(pressedLabels()).toEqual(['Bold reds', 'Cellar picks']);

			deliver();
			expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds', 'cellar-picks']);
			expect(pressedLabels()).toEqual(['Bold reds', 'Cellar picks']);
			expect(matchAny().checked).toBe(true);
		});
	});
});

describe('<SmartFilterPresets /> — a preset replaces the manual filters', () => {
	it('clears a manual facet rule before applying, leaving only the expression', () => {
		const core = renderPresets();

		core.addRule('color', inSet<string>('color', ['white']));
		fireEvent.click(chip('Bold reds'));

		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds']);
	});

	it('clears a manual rule on a preset SWITCH too', () => {
		const core = renderPresets();

		fireEvent.click(chip('Bold reds'));
		// A rule that arrived beside the expression — a `?f` link carrying both, say.
		const withExpression = core.exportConfig();

		core.loadConfig({
			...withExpression,
			rules: [...withExpression.rules, { id: 'color', rule: inSet<string>('color', ['white']).serialize() }],
		});
		expect(core.getRule('color')).toBeDefined();

		fireEvent.click(chip('Cellar picks'));
		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['cellar-picks']);
	});

	it.each([
		['a link written today', linkFor],
		['a link written by engine 0.0.3', legacyLinkFor],
	])('leaving a preset restored from %s gives back the full corpus', (_label, link) => {
		// A restore registers none of the preset's leaves: they live in the expression only. "Pinot" is
		// an OR of two varietals, so its leaves left behind as flat rules would AND together and match
		// nothing at all, with no pill to explain it.
		const core = renderPresets({ link: link(['pinot-any']) });

		expect(pressedLabels()).toEqual(['Pinot']);
		expect(core.getRules().size).toBe(0);
		fireEvent.click(screen.getByRole('button', { name: 'Clear smart filters' }));

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResultCount()).toBe(CORPUS.length);
	});

	it('deselecting the last preset only leaves expression mode', () => {
		const core = renderPresets();

		fireEvent.click(chip('Bold reds'));
		fireEvent.click(chip('Bold reds'));

		expect(core.getExpression()).toBeNull();
		expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);
	});

	it('"Clear smart filters" leaves expression mode and hides itself', () => {
		const core = renderPresets();

		fireEvent.click(chip('Bold reds'));
		fireEvent.click(screen.getByRole('button', { name: 'Clear smart filters' }));

		expect(core.getExpression()).toBeNull();
		expect(screen.queryByRole('button', { name: 'Clear smart filters' })).toBeNull();
	});

	it.each([
		['applying a preset', (): void => {
			fireEvent.click(chip('Bold reds'));
		}],
		['deselecting the last preset', (): void => {
			fireEvent.click(chip('Bold reds'));
			markResolvedAtLeast(captureCurrentVersion());
			fireEvent.click(chip('Bold reds'));
		}],
		['"Clear smart filters"', (): void => {
			fireEvent.click(chip('Bold reds'));
			markResolvedAtLeast(captureCurrentVersion());
			fireEvent.click(screen.getByRole('button', { name: 'Clear smart filters' }));
		}],
		['switching "Match any (OR)"', (): void => {
			fireEvent.click(matchAny());
		}],
	])('marks the action busy when %s', (_label, perform) => {
		renderPresets();
		// One tracker serves the whole route, so settle it first: a test that left it busy would make
		// this pass whatever the action did.
		markResolvedAtLeast(captureCurrentVersion());
		expect(getIsEngineBusy()).toBe(false);

		perform();

		expect(getIsEngineBusy()).toBe(true);
	});
});

