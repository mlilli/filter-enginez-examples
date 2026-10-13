/**
 * `<UrlFormatToggle>` — cycles the shareable-URL serializer format (Readable → Compact → Base64) and
 * re-encodes the current `?f` param into the new format so the switch shows in the address bar
 * immediately. Purely a URL-representation change: the tagged serializer's `decode` auto-detects the
 * old format and `encode` writes the new one, so the engine state is untouched and shared links from
 * any format still decode. Rendered only on URL-state routes, alongside `<CopyLinkButton>`.
 *
 * @remarks
 * Router-coupled (it navigates to rewrite the query), so unlike the rest of the presentation tier
 * this component depends on `react-router` (a peer — the host app owns the router) and
 * `@filter-enginez/url-state-router`. It lives in the `url` subpath, the home for URL-state plumbing.
 *
 * ### Styled by `.fe-url-format-toggle`, not by an inline object
 *
 * The twin of the collapse documented on `<CopyLinkButton>`, and found beside it: this component
 * carried the same nine declarations inline that `ui-styles` already published under the class the
 * other four verticals use, down to the `__kicker` span's `var(--gray-8)`. The original debt note
 * named only the copy button; the toggle had it too. It gains the class's `:hover` (border and text lift to
 * `--gray-6` / `--gray-11`), which the inline version never had — Tailwind's `transition-colors`
 * declares how a color change animates, not that one should happen.
 *
 * @packageDocumentation
 */

import { createTaggedSerializer } from '@filter-enginez/url-state-router';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { cycleUrlFormat, URL_FORMAT_LABELS, useUrlFormat } from './urlFormatStore.js';

/** The URL query key `<FilterEngineUrlSync>` uses (its default `paramKey`). */
const URL_STATE_PARAM = 'f';

/**
 * The shareable-URL format toggle.
 */
export const UrlFormatToggle = (): React.ReactElement => {
	const format = useUrlFormat();
	const location = useLocation();
	const navigate = useNavigate();

	const handleCycle = useCallback((): void => {
		const nextFormat = cycleUrlFormat();
		const params = new URLSearchParams(location.search);
		const current = params.get(URL_STATE_PARAM);

		if (current === null || current === '') {
			return;
		}
		const serializer = createTaggedSerializer(nextFormat);

		try {
			// decode auto-detects the OLD format's tag; re-encode into the new one.
			params.set(URL_STATE_PARAM, serializer.encode(serializer.decode(current)));
			void navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
		} catch {
			// Current param isn't a tagged value we can re-encode — leave it as-is.
		}
	}, [location, navigate]);

	return (
		<button
			type="button"
			onClick={handleCycle}
			aria-label={`Shareable-URL format: ${URL_FORMAT_LABELS[format]}. Activate to cycle formats.`}
			title="Cycle the shareable-URL encoding"
			className="fe-url-format-toggle"
		>
			<span className="fe-url-format-toggle__kicker">URL</span>
			{URL_FORMAT_LABELS[format]}
		</button>
	);
};
