/**
 * `@filter-enginez/examples-shared/viewport` — viewport / breakpoint hooks shared by the React shells.
 *
 * @remarks
 * Dataset-agnostic layout plumbing (unlike the `./wine` slice). Both React apps import the
 * breakpoint switch from here so the sidebar-vs-drawer decision is authored once.
 *
 * @packageDocumentation
 */

export {
	DESKTOP_MEDIA_QUERY,
	DESKTOP_MIN_WIDTH_PX,
	useIsDesktop,
	useMediaQuery,
} from './useMediaQuery.js';
