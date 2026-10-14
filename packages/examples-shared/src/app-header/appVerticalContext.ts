/**
 * Which demo app is rendering — for the React components shared across apps that need to say so.
 *
 * @remarks
 * A dataset route knows its app and passes it to the header directly. The pages both React apps share
 * as route objects — the documentation layout and the 404 — do not, so each app provides its id once,
 * above its router, and those pages read it here. The standalone documentation site provides nothing:
 * it is not one of the six apps, and a header there names the page alone.
 *
 * @packageDocumentation
 */

import { createContext } from 'react';

import { type VerticalId } from '../verticals/verticals.js';

/** The rendering app's id, or `undefined` outside the six apps. */
export const AppVerticalContext = createContext<VerticalId | undefined>(undefined);
