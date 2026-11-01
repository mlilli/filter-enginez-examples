/**
 * Tests for `benchmarkWidget.ts` — a configuration with bitmaps on is shown as a live timing only when
 * it ran on the bitmap path, and an unavailable bitmap path is said, never hidden.
 *
 * @remarks
 * The engine module is replaced by a fake whose bitmap init and measurements each test sets, so the
 * widget's decisions are observed without loading the engine. jsdom has no `IntersectionObserver`, so
 * the widget fetches its engine as soon as it mounts. The workload's own side — that init really
 * engages the bitmap path, and that a measurement reports the path it ran on — is tested against the
 * real engine in examples-shared's `benchmarkBitmapPath.test.ts`.
 *
 * @packageDocumentation
 */

import {
	type BenchmarkConfig,
	BITMAP_REFERENCE_SUBLINE,
	BITMAP_UNAVAILABLE_COPY,
	type BitmapAvailability,
	type BitmapUnavailableReason,
	type EvaluationPath,
	formatDuration,
	REFERENCE_LABEL,
	referenceMsFor,
	type WorkloadSamples,
} from '@filter-enginez/examples-shared/how-it-works';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BenchmarkWidget, createBenchmarkWidget } from './benchmarkWidget.js';

/** What the fake engine module answers, set per test. */
interface FakeEngineAnswers {
	/** What bitmap init reports. */
	bitmap: BitmapAvailability;
	/** The path each measurement reports, by its configuration. */
	pathFor: (config: BenchmarkConfig) => EvaluationPath;
}

/** The answers the current test set. */
const fake: FakeEngineAnswers = vi.hoisted(() => ({
	bitmap: { status: 'ready' },
	pathFor: (config) => (config.bitmap ? 'bitmap' : 'predicate'),
}));

vi.mock('./benchmarkEngine.js', () => ({
	loadWineCorpus: vi.fn(async (): Promise<readonly unknown[]> => {
		await Promise.resolve();

		return [];
	}),
	measureConfig: vi.fn(async (_corpus: readonly unknown[], config: BenchmarkConfig): Promise<WorkloadSamples> => {
		await Promise.resolve();

		// Two warmup passes, then a steady 2 ms: a reading `assessSamples` trusts as live.
		return { path: fake.pathFor(config), resultCount: 42, samples: [9, 9, 2, 2, 2]};
	}),
	prepareBitmapAcceleration: vi.fn(async (): Promise<BitmapAvailability> => {
		await Promise.resolve();

		return fake.bitmap;
	}),
}));

const { measureConfig, prepareBitmapAcceleration } = await import('./benchmarkEngine.js');

/** The configuration the widget opens on: every layer on. */
const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

/** The live median the fake measurement produces. */
const LIVE_MS = 2;

let widget: BenchmarkWidget | null = null;

/**
 * Mount the widget, which fetches its fake engine at once, and wait until it has decided what to show
 * for the configuration it opens on.
 *
 * @returns The widget root.
 */
async function mount(): Promise<HTMLElement> {
	widget = createBenchmarkWidget();
	document.body.append(widget.element);
	const root = widget.element;

	await vi.waitFor(() => {
		expect(prepareBitmapAcceleration).toHaveBeenCalledTimes(1);
		expect(shown(root).status, 'the widget still shows the numbers it opened on').not.toBe(REFERENCE_LABEL);
	});

	return root;
}

/**
 * Read what the widget shows.
 *
 * @param root - The widget root.
 * @returns The number, the line under it, the status line, and whether "retry live" is hidden.
 */
function shown(root: HTMLElement): { isRetryHidden: boolean; number: string; status: string; subline: string } {
	return {
		isRetryHidden: root.querySelector<HTMLElement>('.fe-bench__retry')?.style.display === 'none',
		number: root.querySelector('.fe-bench__number')?.textContent ?? '',
		// The status line's own text node, between its dot and the "retry live" button.
		status: root.querySelector('.fe-bench__status')?.childNodes[1]?.textContent ?? '',
		subline: root.querySelector('.fe-bench__number-sub')?.textContent ?? '',
	};
}

/**
 * Press the "roaring" switch, the first of the three.
 *
 * @param root - The widget root.
 */
function toggleBitmap(root: HTMLElement): void {
	root.querySelector<HTMLButtonElement>('[role="switch"]')?.click();
}

beforeEach(() => {
	document.body.replaceChildren();
	fake.bitmap = { status: 'ready' };
	fake.pathFor = (config) => (config.bitmap ? 'bitmap' : 'predicate');
	vi.mocked(measureConfig).mockClear();
	vi.mocked(prepareBitmapAcceleration).mockClear();
});

afterEach(() => {
	widget?.dispose();
	widget = null;
});

describe('the benchmark widget, with bitmaps initialized', () => {
	it('initializes bitmaps before it measures, then shows the bitmap configuration live', async () => {
		const root = await mount();

		expect(vi.mocked(prepareBitmapAcceleration).mock.invocationCallOrder[0]).toBeLessThan(
			Number(vi.mocked(measureConfig).mock.invocationCallOrder[0]),
		);
		expect(vi.mocked(measureConfig).mock.calls[0]?.[1]).toEqual(ALL_ON);
		expect(shown(root)).toEqual({
			isRetryHidden: true,
			number: formatDuration(LIVE_MS),
			status: 'measured on your machine',
			subline: 'median of 5 passes',
		});
	});
});

describe.each<[Exclude<BitmapUnavailableReason, 'not-engaged'>, string]>([
	['peer-missing', 'MODE_ACCELERATION_PEER_MISSING'],
	['init-failed', 'ACCELERATION_INIT_FAILED'],
])('the benchmark widget, when bitmap init fails (%s, from %s)', (reason) => {
	it('never measures a bitmap configuration, shows its reference number, and says why', async () => {
		fake.bitmap = { reason, status: 'unavailable' };

		const root = await mount();

		expect(measureConfig).not.toHaveBeenCalled();
		expect(shown(root)).toEqual({
			isRetryHidden: true,
			number: formatDuration(referenceMsFor(ALL_ON)),
			status: `${BITMAP_UNAVAILABLE_COPY[reason]} · showing ${REFERENCE_LABEL}`,
			subline: BITMAP_REFERENCE_SUBLINE,
		});
	});

	it('still measures the configurations without bitmaps live, and drops the notice for them', async () => {
		fake.bitmap = { reason, status: 'unavailable' };

		const root = await mount();

		toggleBitmap(root);
		await vi.waitFor(() => {
			expect(shown(root).status).toBe('measured on your machine');
		});
		expect(vi.mocked(measureConfig).mock.calls.map(([, config]) => config.bitmap)).toEqual([false]);
		expect(shown(root).number).toBe(formatDuration(LIVE_MS));

		toggleBitmap(root);
		expect(shown(root).status).toBe(`${BITMAP_UNAVAILABLE_COPY[reason]} · showing ${REFERENCE_LABEL}`);
		expect(shown(root).number).toBe(formatDuration(referenceMsFor(ALL_ON)));
		expect(measureConfig).toHaveBeenCalledTimes(1);
	});
});

describe('the benchmark widget, when a bitmap configuration runs on the predicate path anyway', () => {
	it('does not show that timing as a bitmap timing', async () => {
		fake.pathFor = () => 'predicate';

		const root = await mount();

		expect(measureConfig).toHaveBeenCalledTimes(1);
		expect(shown(root)).toEqual({
			isRetryHidden: true,
			number: formatDuration(referenceMsFor(ALL_ON)),
			status: `${BITMAP_UNAVAILABLE_COPY['not-engaged']} · showing ${REFERENCE_LABEL}`,
			subline: BITMAP_REFERENCE_SUBLINE,
		});
	});
});
