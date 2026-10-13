/**
 * Structural-compatibility guard for the neutral `PickerTreeNode`.
 *
 * @remarks
 * `pickerTree.ts` declares the picker-node shape locally so this slice has no React dependency, on the
 * explicit promise that the declaration stays structurally identical to `@filter-enginez/react-ui`'s
 * `PickerTreeNode` — that promise is what lets `buildListingLocationTree`'s output be handed straight
 * to `<HierarchicalPicker>` without a cast.
 *
 * A promise like that rots silently. If react-ui adds a required field, the React apps break at their
 * call site (loud, fine); if react-ui RELAXES its shape, nothing breaks but the two definitions have
 * quietly diverged and the next person to reconcile them has no idea which is authoritative. These
 * are compile-time assignability assertions in both directions, so the drift fails here — in the file
 * that made the promise — rather than somewhere downstream.
 *
 * @packageDocumentation
 */

import type { PickerTreeNode as ReactUiPickerTreeNode } from '@filter-enginez/react-ui';

import { describe, expect, it } from 'vitest';

import type { PickerTreeNode } from './pickerTree.js';

import { buildListingLocationTree } from './extractors.js';

describe('PickerTreeNode structural compatibility', () => {
	it('is assignable to react-ui\'s PickerTreeNode', () => {
		const neutral: PickerTreeNode = { children: [{ id: 'leaf', label: 'Leaf' }], id: 'root', label: 'Root' };
		// The assignment IS the assertion — this file failing to typecheck is the failure signal.
		const reactUi: ReactUiPickerTreeNode = neutral;

		expect(reactUi.id).toBe('root');
	});

	it('accepts react-ui\'s PickerTreeNode', () => {
		const reactUi: ReactUiPickerTreeNode = { children: [{ id: 'leaf', label: 'Leaf' }], id: 'root', label: 'Root' };
		const neutral: PickerTreeNode = reactUi;

		expect(neutral.children).toHaveLength(1);
	});

	it('types the real location tree, which is what the picker actually renders', () => {
		const tree: ReactUiPickerTreeNode = buildListingLocationTree([]);

		expect(tree).toMatchObject({ id: 'location', label: 'Location' });
	});
});
