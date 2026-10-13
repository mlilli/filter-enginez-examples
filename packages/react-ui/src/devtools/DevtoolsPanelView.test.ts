/**
 * Tests for `<DevtoolsPanelView />` — the controlled devtools action-log view (header + row list +
 * drag-scrubbable timeline).
 *
 * @remarks
 * jsdom render via `createElement`. Browser affordances jsdom lacks are stubbed narrowly:
 * `setPointerCapture` (a no-op — `handlePointerDown` calls it unwrapped), a `getBoundingClientRect`
 * spy giving the strip a real width for `indexFromPointer`, and a captured `requestAnimationFrame`
 * for the row-list auto-scroll effect. `releasePointerCapture` is deliberately left undefined so
 * `handlePointerUp`'s `try/catch` catch-arm is exercised.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type DevtoolsLogEntry, DevtoolsPanelView, type DevtoolsPanelViewProps } from './DevtoolsPanelView.js';

beforeAll(() => {
	// jsdom implements neither pointer-capture method. Provide a no-op setter so the unwrapped
	// `handlePointerDown` call doesn't throw; leave releasePointerCapture undefined on purpose.
	HTMLElement.prototype.setPointerCapture = () => undefined;
});

afterEach(cleanup);

/** Build `count` log entries with unique keys (distinct timestamps). */
function makeEntries(count: number, type = 'RULE_CHANGED'): DevtoolsLogEntry[] {
	return Array.from({ length: count }, (_unused, index) => ({
		summary: `s${index}`,
		timestamp: 1_700_000_000_000 + index * 1000,
		type,
	}));
}

const ENTRIES: readonly DevtoolsLogEntry[] = [
	{ summary: '<price>', timestamp: 1_700_000_000_000, type: 'RULE_ADDED' },
	{ summary: '<color>', timestamp: 1_700_000_001_000, type: 'RULE_CHANGED' },
	{ summary: '<price>', timestamp: 1_700_000_002_000, type: 'RULE_REMOVED' },
];

/** A full, valid prop set with the supplied overrides. */
function props(overrides: Partial<DevtoolsPanelViewProps> = {}): DevtoolsPanelViewProps {
	return {
		activeCursor: 0,
		entries: ENTRIES,
		isComputing: false,
		onClose: vi.fn(),
		onCommit: vi.fn(),
		onJump: vi.fn(),
		onScrub: vi.fn(),
		...overrides,
	};
}

/** Render with base props + overrides. */
function renderPanel(overrides: Partial<DevtoolsPanelViewProps> = {}): ReturnType<typeof render> {
	return render(createElement(DevtoolsPanelView, props(overrides)));
}

/** Give the timeline strip a real bounding box (width 200, left 0) for pointer math. */
function stubStripRect(strip: HTMLElement): void {
	vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({
		bottom: 20,
		height: 20,
		left: 0,
		right: 200,
		toJSON: () => ({}),
		top: 0,
		width: 200,
		x: 0,
		y: 0,
	});
}

describe('DevtoolsPanelView — header', () => {
	it('pluralizes the action count and shows the 1-based step', () => {
		const { container, rerender } = renderPanel({ activeCursor: 1, entries: ENTRIES });

		expect(container.querySelector('.fe-devtools-panel__meta')?.textContent).toContain('3 actions');
		expect(container.querySelector('.fe-devtools-panel__step')?.textContent).toBe('#2');

		rerender(createElement(DevtoolsPanelView, props({ activeCursor: 0, entries: makeEntries(1) })));
		expect(container.querySelector('.fe-devtools-panel__meta')?.textContent).toContain('1 action');
	});

	it('fires onClose from the close button', () => {
		const onClose = vi.fn();

		renderPanel({ onClose });
		fireEvent.click(screen.getByRole('button', { name: 'Close devtools' }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe('DevtoolsPanelView — row list', () => {
	it('renders the empty state when there are no actions', () => {
		const { container } = renderPanel({ entries: []});

		expect(screen.getByText(/No actions yet/)).not.toBeNull();
		expect(container.querySelector('.fe-devtools-row')).toBeNull();
	});

	it('dims the log while computing', () => {
		const { container } = renderPanel({ isComputing: true });

		expect(container.querySelector('.fe-devtools-log--computing')).not.toBeNull();
	});

	it('marks the active row (aria-current + marker) and jumps on click', () => {
		const onJump = vi.fn();

		renderPanel({ activeCursor: 1, entries: ENTRIES, onJump });
		const rows = screen.getAllByRole('button', { name: /Jump to action/ });

		expect(rows[1]?.getAttribute('aria-current')).toBe('true');
		expect(rows[1]?.className).toContain('fe-devtools-row--active');
		expect(rows[0]?.getAttribute('aria-current')).toBeNull();

		fireEvent.click(rows[2] as HTMLElement);
		expect(onJump).toHaveBeenCalledWith(2);
	});

	it('maps every action type to its short label + color modifier (known + unknown)', () => {
		const matrix = [
			{ modifier: 'danger', short: 'removeRule', type: 'RULE_REMOVED' },
			{ modifier: 'danger', short: 'removeGroup', type: 'GROUP_REMOVED' },
			{ modifier: 'danger', short: 'clearRules', type: 'RULES_CLEARED' },
			{ modifier: 'danger', short: 'reset', type: 'RESET' },
			{ modifier: 'danger', short: 'resetWorkingSet', type: 'WORKING_SET_RESET' },
			{ modifier: 'added', short: 'addGroup', type: 'GROUP_ADDED' },
			{ modifier: 'added', short: 'addRule', type: 'RULE_ADDED' },
			{ modifier: 'neutral', short: 'changeRule', type: 'RULE_CHANGED' },
			{ modifier: 'neutral', short: 'mystery_type', type: 'MYSTERY_TYPE' },
		];
		const entries = matrix.map((testCase, index) => ({
			summary: `s${index}`,
			timestamp: 1_700_000_000_000 + index * 1000,
			type: testCase.type,
		}));
		const { container } = renderPanel({ entries });
		const typeCells = [...container.querySelectorAll('.fe-devtools-row__type')];

		matrix.forEach((testCase, index) => {
			expect(typeCells[index]?.textContent).toBe(testCase.short);
			expect(typeCells[index]?.className).toContain(`fe-devtools-row__type--${testCase.modifier}`);
		});
	});

	it('auto-scrolls the active row into view on cursor change', () => {
		const frames: FrameRequestCallback[] = [];

		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => frames.push(cb));
		vi.stubGlobal('cancelAnimationFrame', () => undefined);
		const scrollSpy = vi.fn();

		Element.prototype.scrollIntoView = scrollSpy;

		const { rerender } = renderPanel({ activeCursor: 0, entries: ENTRIES });

		act(() => {
			frames.shift()?.(0);
		});
		expect(scrollSpy).toHaveBeenCalledTimes(1);

		act(() => {
			rerender(createElement(DevtoolsPanelView, props({ activeCursor: 1, entries: ENTRIES })));
		});
		act(() => {
			frames.shift()?.(0);
		});
		expect(scrollSpy).toHaveBeenCalledTimes(2);

		vi.unstubAllGlobals();
	});

	it('no-ops the scroll effect when there is no active row (empty log)', () => {
		const frames: FrameRequestCallback[] = [];

		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => frames.push(cb));
		vi.stubGlobal('cancelAnimationFrame', () => undefined);
		const scrollSpy = vi.fn();

		Element.prototype.scrollIntoView = scrollSpy;
		renderPanel({ entries: []});

		act(() => {
			frames.shift()?.(0);
		});
		expect(scrollSpy).not.toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
});

describe('DevtoolsPanelView — timeline', () => {
	it('renders the empty footer (no strip) when there are no entries', () => {
		const { container } = renderPanel({ entries: []});

		expect(container.querySelector('.fe-devtools-timeline--empty')).not.toBeNull();
		expect(container.querySelector('.fe-devtools-timeline__strip')).toBeNull();
	});

	it('renders the scrubber strip with slider a11y and one dot per entry', () => {
		const { container } = renderPanel({ activeCursor: 1, entries: ENTRIES });
		const strip = screen.getByRole('slider');

		expect(strip.getAttribute('aria-valuemin')).toBe('0');
		expect(strip.getAttribute('aria-valuemax')).toBe('2');
		expect(strip.getAttribute('aria-valuenow')).toBe('1');
		expect(container.querySelectorAll('.fe-devtools-dot')).toHaveLength(3);
		expect(container.querySelectorAll('.fe-devtools-dot--active')).toHaveLength(1);
	});

	it('dims the timeline while computing', () => {
		const { container } = renderPanel({ entries: ENTRIES, isComputing: true });

		expect(container.querySelector('.fe-devtools-timeline--computing')).not.toBeNull();
	});

	it('scrubs via keyboard (arrows / home / end) and ignores other keys', () => {
		const onCommit = vi.fn();
		const onScrub = vi.fn();

		renderPanel({ activeCursor: 2, entries: makeEntries(5), onCommit, onScrub });
		const strip = screen.getByRole('slider');

		fireEvent.keyDown(strip, { key: 'ArrowLeft' });
		expect(onScrub).toHaveBeenLastCalledWith(1);
		expect(onCommit).toHaveBeenLastCalledWith(1);

		fireEvent.keyDown(strip, { key: 'ArrowRight' });
		expect(onScrub).toHaveBeenLastCalledWith(3);

		fireEvent.keyDown(strip, { key: 'Home' });
		expect(onScrub).toHaveBeenLastCalledWith(0);

		fireEvent.keyDown(strip, { key: 'End' });
		expect(onScrub).toHaveBeenLastCalledWith(4);

		const scrubCount = onScrub.mock.calls.length;

		fireEvent.keyDown(strip, { key: 'a' });
		expect(onScrub).toHaveBeenCalledTimes(scrubCount);
	});

	it('scrubs via pointer drag: down snaps, move re-snaps + de-dupes, up commits', () => {
		const onCommit = vi.fn();
		const onScrub = vi.fn();

		renderPanel({ entries: makeEntries(5), onCommit, onScrub });
		const strip = screen.getByRole('slider');

		stubStripRect(strip);

		// clientX 100 → offsetX 94 / usableWidth 188 ≈ 0.5 → round(0.5 * 4) = 2.
		fireEvent.pointerDown(strip, { clientX: 100, pointerId: 1 });
		expect(onScrub).toHaveBeenLastCalledWith(2);

		// clientX 194 → offsetX 188 → ratio 1 → 4.
		fireEvent.pointerMove(strip, { clientX: 194, pointerId: 1 });
		expect(onScrub).toHaveBeenLastCalledWith(4);

		// Same index again → de-duped, no new onScrub.
		fireEvent.pointerMove(strip, { clientX: 194, pointerId: 1 });
		expect(onScrub).toHaveBeenCalledTimes(2);

		// Release commits the last scrub index (releasePointerCapture throws → caught).
		fireEvent.pointerUp(strip, { clientX: 194, pointerId: 1 });
		expect(onCommit).toHaveBeenCalledWith(4);
	});

	it('snaps to 0 for a single-entry timeline', () => {
		const onScrub = vi.fn();

		renderPanel({ entries: makeEntries(1), onScrub });
		const strip = screen.getByRole('slider');

		stubStripRect(strip);
		fireEvent.pointerDown(strip, { clientX: 150, pointerId: 1 });

		expect(onScrub).toHaveBeenCalledWith(0);
	});

	it('snaps to 0 when the strip has collapsed below a usable width', () => {
		const onScrub = vi.fn();

		renderPanel({ entries: makeEntries(5), onScrub });
		const strip = screen.getByRole('slider');

		// width 10 → usableWidth = 10 - 12 = -2 <= 0 → the guard returns 0.
		vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({
			bottom: 0,
			height: 0,
			left: 0,
			right: 10,
			toJSON: () => ({}),
			top: 0,
			width: 10,
			x: 0,
			y: 0,
		});
		fireEvent.pointerDown(strip, { clientX: 5, pointerId: 1 });

		expect(onScrub).toHaveBeenCalledWith(0);
	});

	it('ignores pointer move / up with no active drag', () => {
		const onCommit = vi.fn();
		const onScrub = vi.fn();

		renderPanel({ entries: makeEntries(5), onCommit, onScrub });
		const strip = screen.getByRole('slider');

		fireEvent.pointerMove(strip, { clientX: 100, pointerId: 1 });
		fireEvent.pointerUp(strip, { clientX: 100, pointerId: 1 });

		expect(onScrub).not.toHaveBeenCalled();
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('blocks pointer scrub while computing', () => {
		const onScrub = vi.fn();

		renderPanel({ entries: makeEntries(5), isComputing: true, onScrub });
		const strip = screen.getByRole('slider');

		stubStripRect(strip);
		fireEvent.pointerDown(strip, { clientX: 100, pointerId: 1 });

		expect(onScrub).not.toHaveBeenCalled();
	});
});
