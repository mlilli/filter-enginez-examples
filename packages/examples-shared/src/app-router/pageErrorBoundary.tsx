/**
 * `<PageErrorBoundary>` — the React apps' root error boundary, around their routes.
 *
 * @remarks
 * A declarative router renders whatever its routes render and catches nothing, so without a boundary
 * a page whose code fails to load (a `React.lazy` import that rejects) or a page that throws while
 * rendering unmounts the whole app and leaves a blank page. This boundary shows
 * {@link PageErrorScreen} instead, with its one main landmark.
 *
 * It sits inside the router and is told the current path, so that leaving the failed page, with the
 * back button or a link, clears the failure and renders the next route, rather than keeping the error
 * screen up until a reload. A route that handles its own failures (a dataset whose engine does not
 * boot shows its boot-error screen) never reaches it.
 *
 * A class, because an error boundary can only be one: React has no hook for
 * `getDerivedStateFromError`. Lower-case file, because the reset is logic and stays in coverage.
 *
 * @packageDocumentation
 */

import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router';

import { PageErrorScreen } from './PageErrorScreen.js';

/** Props for {@link PageErrorBoundary}. */
export interface PageErrorBoundaryProps {
	/** The routes. */
	readonly children: ReactNode;
}

/** Props for {@link PageErrorCatcher}: the routes, and the path they are showing. */
interface PageErrorCatcherProps extends PageErrorBoundaryProps {
	/** The current path; a new one clears a caught failure. */
	readonly pathname: string;
}

/** What {@link PageErrorCatcher} holds. */
interface PageErrorCatcherState {
	/** What was thrown, when {@link PageErrorCatcherState.hasFailed}. */
	readonly error: unknown;
	/** Whether the routes threw; separate from `error`, since anything can be thrown, `undefined` included. */
	readonly hasFailed: boolean;
	/** The path the failure, if any, belongs to. */
	readonly pathname: string;
}

/**
 * The boundary itself, given the path by {@link PageErrorBoundary}.
 *
 * @internal
 */
class PageErrorCatcher extends Component<PageErrorCatcherProps, PageErrorCatcherState> {
	/**
	 * Record a failure thrown by the routes.
	 *
	 * @param error - What was thrown.
	 * @returns The failed state.
	 */
	static getDerivedStateFromError(error: unknown): Partial<PageErrorCatcherState> {
		return { error, hasFailed: true };
	}

	/**
	 * Clear a failure once the router shows another path.
	 *
	 * @param props - The current props.
	 * @param state - The current state.
	 * @returns The cleared state on a new path; otherwise no change.
	 */
	static getDerivedStateFromProps(props: PageErrorCatcherProps, state: PageErrorCatcherState): Partial<PageErrorCatcherState> | null {
		return props.pathname === state.pathname ? null : { error: undefined, hasFailed: false, pathname: props.pathname };
	}

	override state: PageErrorCatcherState = { error: undefined, hasFailed: false, pathname: this.props.pathname };

	override render(): ReactNode {
		return this.state.hasFailed ? <PageErrorScreen error={this.state.error} /> : this.props.children;
	}
}

/**
 * Show {@link PageErrorScreen} in place of routes that fail to load or render.
 *
 * @param props - The routes.
 * @returns The routes, or the error screen.
 */
export const PageErrorBoundary = ({ children }: PageErrorBoundaryProps): React.ReactElement => {
	const { pathname } = useLocation();

	return <PageErrorCatcher pathname={pathname}>{children}</PageErrorCatcher>;
};
