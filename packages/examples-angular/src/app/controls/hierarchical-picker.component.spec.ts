/**
 * Tests for `<fe-hierarchical-picker>`, the flat tri-state tree picker.
 *
 * @remarks
 * The load-bearing test here is the first one. The picker's rows come from walking the tree, while
 * the predictive-disable BUNDLE flattens it separately (`buildOriginNodeSpecs` for wine,
 * `buildLocationNodeSpecs` for real estate, which emits `{ leafIds, value }` with no `depth` and no
 * `label`, because a bundle candidate never needs either).
 *
 * The two lists are independent, so something has to keep the two
 * orderings honest, since a reader looking at the panel cannot tell which list produced which. If the
 * rendered order ever diverges from the bundle's pre-order flatten, the picker's disabled states and
 * count badges would attach to the wrong rows: silently, plausibly, and only for trees deep enough to
 * notice.
 *
 * These run through Angular's own `ng test` (Vitest runner) rather than the root Vitest config,
 * because component specs need the AOT template compile step first — the same reason the Vue and
 * SvelteKit apps self-test.
 *
 * @packageDocumentation
 */

import type { PickerTreeNode } from '@filter-enginez/examples-shared/picker';

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { buildOriginNodeSpecs } from '@filter-enginez/examples-shared/wine-domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { HierarchicalPickerComponent } from './hierarchical-picker.component.js';

/** Three levels, uneven branching, so depth and pre-order are both distinguishable. */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'IT-PIE', label: 'Piedmont' },
				{
					children: [{ id: 'IT-VEN-VAL', label: 'Valpolicella' }],
					id: 'IT-VEN',
					label: 'Veneto',
				},
			],
			id: 'IT',
			label: 'Italy',
		},
		{ id: 'FR', label: 'France' },
	],
	id: 'root',
	label: 'All',
};

/** The indent step the component applies per level; inverted in the pre-order assertion. */
const INDENT_REM_PER_LEVEL = 0.875;

/** Host that drives the component under test. Each test overrides only the signal it is about. */
@Component({
	imports: [HierarchicalPickerComponent],
	template: `
		<fe-hierarchical-picker
			groupLabel="Origin"
			[counts]="counts()"
			[disabled]="disabled()"
			[selected]="selected()"
			[tree]="tree()"
			(selectionChange)="emissions.set([...emissions(), $event])"
		/>
	`,
})
class HostComponent {
	/** Projected record counts from the engine's bundle. Empty means "not settled yet". */
	public readonly counts = signal<ReadonlyMap<string, number>>(new Map<string, number>());
	/** Node ids whose selection would empty the result set. */
	public readonly disabled = signal<ReadonlySet<string>>(new Set<string>());
	/** The compact selection. */
	public readonly selected = signal<readonly string[]>([]);
	/** The tree under test. */
	public readonly tree = signal<PickerTreeNode>(TREE);
	/** Every emission, in order — so a test can assert that NOTHING was emitted. */
	public readonly emissions = signal<readonly (readonly string[])[]>([]);
}

describe('HierarchicalPickerComponent', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/** Every rendered row, in document order. */
	const rows = (): HTMLElement[] =>
		Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-tree__row'));

	/** Every selection control, in document order. */
	const controls = (): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('[role="checkbox"]'));

	/** Every visible node label, in document order. */
	const labels = (): string[] =>
		Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-tree__label')).map(
			(element) => element.textContent.trim(),
		);

	/** The selection control whose label contains `text`. */
	const controlFor = (text: string): HTMLButtonElement | undefined =>
		controls().find((button) => button.textContent.includes(text));

	/** A disclosure button by its accessible name, e.g. `'Expand Italy'`. */
	const disclosure = (accessibleName: string): HTMLButtonElement | null =>
		fixture.nativeElement.querySelector(`[aria-label="${accessibleName}"]`) as HTMLButtonElement | null;

	/** Click an element and flush the resulting render. */
	const click = (element: HTMLElement | null | undefined): void => {
		if (element === null || element === undefined) {
			throw new Error('expected the element to be rendered');
		}
		element.click();
		fixture.detectChanges();
	};

	/**
	 * A row's depth, recovered from its inline indent.
	 *
	 * @remarks
	 * Inverted back through the indent step so the assertion is about DEPTH rather than about a pixel
	 * value that could be restyled. A depth-zero row may serialize its indent as `0rem` or omit it
	 * entirely depending on the DOM implementation; both parse to zero.
	 *
	 * @param row - The row element.
	 * @returns Its nesting depth, root excluded.
	 */
	const depthOf = (row: HTMLElement): number =>
		Math.round((Number.parseFloat(row.style.paddingLeft) || 0) / INDENT_REM_PER_LEVEL);

	/** Expand every parent so the whole tree is on screen. */
	const expandAll = (): void => {
		// Re-queried each pass: expanding a branch inserts rows whose own disclosures did not exist yet.
		for (let pass = 0; pass < 3; pass += 1) {
			const collapsed = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('.fe-tree__toggle'),
			).filter((button) => button.getAttribute('aria-expanded') === 'false');

			for (const button of collapsed) {
				button.click();
			}
			fixture.detectChanges();
		}
	};

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	describe('row derivation', () => {
		it('renders the same nodes, in the same pre-order, at the same depths as the bundle flattener', () => {
			expandAll();

			const rendered = rows().map((row) => ({
				depth: depthOf(row),
				label: row.querySelector('.fe-tree__label')?.textContent.trim() ?? '',
			}));

			const expected = buildOriginNodeSpecs(TREE).map((spec) => ({
				depth: spec.depth,
				label: spec.label,
			}));

			expect(rendered).toEqual(expected);
		});

		it('never renders the root', () => {
			// The root is a container nobody selects. Rendering it would offer a single click that selects
			// the entire corpus — which is what "no filter" already means.
			expect(fixture.nativeElement.textContent).not.toContain('All');
		});

		it('starts collapsed, showing only the top level', () => {
			expect(labels()).toEqual(['Italy', 'France']);
		});

		it('reveals a branch on expand and hides it again on collapse', () => {
			click(disclosure('Expand Italy'));
			expect(labels()).toContain('Piedmont');

			click(disclosure('Collapse Italy'));
			expect(labels()).not.toContain('Piedmont');
		});

		it('marks leaves so they reserve the disclosure column', () => {
			// Italy has children, France does not.
			expect(rows().map((row) => row.classList.contains('fe-tree__row--leaf'))).toEqual([
				false,
				true,
			]);
		});
	});

	describe('selection', () => {
		it('hands back the whole next selection, not the clicked id', () => {
			// One click can cascade a subtree or de-cascade an ancestor into its siblings, so "which id
			// changed" is not expressible — the compact model means the caller needs the whole array.
			click(controls()[0]);

			expect(host.emissions()).toEqual([['IT']]);
		});

		it('announces a partly-selected parent as mixed', () => {
			host.selected.set(['IT-PIE']);
			fixture.detectChanges();
			click(disclosure('Expand Italy'));

			// `aria-checked="mixed"` is why these rows are buttons with `role="checkbox"` rather than
			// toggle buttons: `aria-pressed` has no mixed value, so a half-selected country would announce
			// as fully on or fully off.
			expect(controls()[0]?.getAttribute('aria-checked')).toBe('mixed');
		});

		it('marks a node checked through its ancestor', () => {
			host.selected.set(['IT']);
			fixture.detectChanges();
			click(disclosure('Expand Italy'));

			expect(controlFor('Piedmont')?.getAttribute('aria-checked')).toBe('true');
		});
	});

	describe('predictive disable', () => {
		it('disables a node whose selection would empty the results', () => {
			host.disabled.set(new Set(['FR']));
			fixture.detectChanges();

			expect(controlFor('France')?.disabled).toBe(true);
		});

		it('leaves a checked node clickable even when it would be empty', () => {
			// The escape hatch. Without it a user who filtered themselves into a corner has no way out:
			// the only control that could widen the results is the one they cannot press.
			host.disabled.set(new Set(['FR']));
			host.selected.set(['FR']);
			fixture.detectChanges();

			expect(controlFor('France')?.disabled).toBe(false);
		});

		it('renders no badge for a node the bundle has not answered for', () => {
			// Empty counts means the bundle has not settled. A placeholder number would be replaced
			// moments later by a different one, which reads as the UI correcting itself.
			expect(fixture.nativeElement.querySelectorAll('.fe-tree__count')).toHaveLength(0);
		});

		it('renders the projected count when the bundle has one', () => {
			host.counts.set(new Map([['FR', 42]]));
			fixture.detectChanges();

			expect(
				Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-tree__count')).map(
					(element) => element.textContent.trim(),
				),
			).toEqual(['42']);
		});
	});

	describe('expansion state', () => {
		it('does not put expansion into the change stream', () => {
			// Expansion is a view preference, not filter state — the distinction that keeps it out of the
			// shareable URL. A disclosure click that emitted a selection would round-trip into the engine.
			click(disclosure('Expand Italy'));

			expect(host.emissions()).toEqual([]);
		});
	});
});
