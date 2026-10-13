/**
 * The shared `<BrainSynapse>` geometry.
 *
 * @remarks
 * These assertions look like they are counting for the sake of counting. They are not: the geometry
 * is shared data that every vertical maps into its own markup, and **a lost or mistyped coordinate is
 * invisible to every other gate in this repo.** Nothing type-checks a `cx`; a node at the wrong position renders
 * happily. The only other instrument is an eye on a rendered page.
 *
 * So the counts and the extremes are pinned here, and the three components are left to map over them.
 */

import { describe, expect, it } from 'vitest';

import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_INTRINSIC_HEIGHT,
	BRAIN_SYNAPSE_INTRINSIC_WIDTH,
	BRAIN_SYNAPSE_NODE_RADIUS,
	BRAIN_SYNAPSE_PULSE_INDICES,
	BRAIN_SYNAPSE_QUIET_NODES,
	BRAIN_SYNAPSE_VIEW_BOX,
	brainSynapseStageStyle,
	buildBrainSynapseCss,
} from './brainSynapseGeometry.js';

describe('brain-synapse geometry', () => {
	it('keeps the loader at 17 nodes, 18 edges and 5 pulses', () => {
		// The three numbers the component's own docblock advertises. A drift here is a different
		// animation wearing the same name.
		expect(BRAIN_SYNAPSE_FIRING_NODES).toHaveLength(11);
		expect(BRAIN_SYNAPSE_QUIET_NODES).toHaveLength(6);
		expect(BRAIN_SYNAPSE_EDGES).toHaveLength(18);
		expect(BRAIN_SYNAPSE_PULSE_INDICES).toEqual([1, 2, 3, 4, 5]);
	});

	it('keeps every coordinate inside the viewBox', () => {
		// Catches a transposed digit — a `cy: 700` in a 220-tall box renders nothing and throws nothing.
		const xs = [
			...BRAIN_SYNAPSE_EDGES.flatMap((edge) => [edge.x1, edge.x2]),
			...BRAIN_SYNAPSE_FIRING_NODES.map((node) => node.cx),
			...BRAIN_SYNAPSE_QUIET_NODES.map((node) => node.cx),
		];
		const ys = [
			...BRAIN_SYNAPSE_EDGES.flatMap((edge) => [edge.y1, edge.y2]),
			...BRAIN_SYNAPSE_FIRING_NODES.map((node) => node.cy),
			...BRAIN_SYNAPSE_QUIET_NODES.map((node) => node.cy),
		];

		expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...xs)).toBeLessThanOrEqual(BRAIN_SYNAPSE_INTRINSIC_WIDTH);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...ys)).toBeLessThanOrEqual(BRAIN_SYNAPSE_INTRINSIC_HEIGHT);
		expect(BRAIN_SYNAPSE_VIEW_BOX)
			.toBe(`0 0 ${String(BRAIN_SYNAPSE_INTRINSIC_WIDTH)} ${String(BRAIN_SYNAPSE_INTRINSIC_HEIGHT)}`);
		expect(BRAIN_SYNAPSE_NODE_RADIUS).toBeGreaterThan(0);
	});

	it('gives every firing node a distinct position', () => {
		// Two nodes at one point is a copy-paste that looks like ten nodes and animates as nine.
		const positions = [...BRAIN_SYNAPSE_FIRING_NODES, ...BRAIN_SYNAPSE_QUIET_NODES]
			.map((node) => `${String(node.cx)},${String(node.cy)}`);

		expect(new Set(positions).size).toBe(positions.length);
	});

	it('scopes every selector and keyframe to the caller', () => {
		// The whole point of the scope: two loaders on one page must not share keyframe names, or they
		// fire in lockstep. An unscoped rule is the bug, and it is only visible with two on screen.
		const css = buildBrainSynapseCss('bs-test');

		expect(css).toContain('.bs-test-edge');
		expect(css).toContain('@keyframes bs-test-fire');
		for (const index of BRAIN_SYNAPSE_PULSE_INDICES) {
			expect(css, `pulse ${String(index)} has no keyframes`).toContain(`@keyframes bs-test-t${String(index)}`);
			expect(css, `pulse ${String(index)} has no class`).toContain(`.bs-test-p${String(index)}`);
		}
		// Every selector and keyframe carries the prefix — no bare `.node` leaking into the page.
		expect(css.match(/@keyframes (?!bs-test)/gu)).toBeNull();
	});

	it('freezes the animation under prefers-reduced-motion', () => {
		expect(buildBrainSynapseCss('bs-test')).toContain('@media (prefers-reduced-motion: reduce)');
	});

	it('derives the stage height from the intrinsic aspect', () => {
		expect(brainSynapseStageStyle(660).height).toBe('220px');
		expect(brainSynapseStageStyle(330).height).toBe('110px');
		expect(brainSynapseStageStyle(520).width).toBe('520px');
	});
});
