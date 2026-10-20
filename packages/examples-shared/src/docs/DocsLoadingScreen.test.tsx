/**
 * The docs' cold-load screen is one main landmark holding the loader.
 *
 * @remarks
 * The router shows it while a docs route's code arrives, on the documentation site and in both React
 * apps, and an accessibility audit run in that moment reads this screen and nothing else.
 *
 * @packageDocumentation
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DocsLoadingScreen } from './DocsLoadingScreen.js';

// No `globals: true`, so Testing Library registers no auto-cleanup.
afterEach(cleanup);

describe('DocsLoadingScreen', () => {
	it('is one main landmark holding the loader', () => {
		render(<DocsLoadingScreen />);

		const mains = screen.getAllByRole('main');

		expect(mains).toHaveLength(1);
		expect(within(mains[0] as HTMLElement).getByLabelText('Loading the documentation')).toBeDefined();
	});
});
