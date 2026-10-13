/**
 * Root component — the router outlet and nothing else.
 *
 * @remarks
 * Kept deliberately empty so every route owns its own layout, matching the React / Svelte / Vue shells.
 * `ChangeDetectionStrategy.OnPush` is set on every component in this app: with zoneless change
 * detection, `OnPush` is the only strategy that actually describes what happens (dirty-marking driven
 * by `async` pipe emissions and signal reads), and stating it keeps the intent legible.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet],
	selector: 'fe-root',
	template: '<router-outlet />',
})
export class AppComponent {}
