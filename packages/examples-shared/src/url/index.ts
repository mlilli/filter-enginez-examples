/**
 * `@filter-enginez/examples-shared/url` — URL-state shell affordances shared by the React apps.
 *
 * @remarks
 * Dataset-agnostic UI plumbing for the shareable-filter-URL routes (paired with
 * `@filter-enginez/url-state-router`'s `<FilterEngineUrlSync>`). Browser-only.
 *
 * @packageDocumentation
 */

export { CompareLinkButton, type CompareLinkButtonProps } from './CompareLinkButton.js';
export { CopyLinkButton } from './CopyLinkButton.js';
export { cycleUrlFormat, setUrlFormat, URL_FORMAT_LABELS, type UrlFormat, useUrlFormat } from './urlFormatStore.js';
export { UrlFormatToggle } from './UrlFormatToggle.js';
