/**
 * The active-filter chip contract, shared by every dataset's rule summarizer.
 *
 * @remarks
 * One entry per constraining rule: what the results header renders as a removable pill.
 *
 * ### Why this is its own module
 *
 * Both `books-domain/ruleSummaries.ts` and `real-estate-domain/ruleSummaries.ts` produce this shape.
 * Two structurally compatible declarations would type-check silently side by side, and that is not
 * harmless: Angular's `<fe-results-header>` and vanilla's `createResultsView` take one
 * `RuleSummarizer` type, and their routes hand them both the books and the real-estate summarizer —
 * so a member added to one copy would break a route with an error pointing at the wrong package. One
 * declaration, no accident.
 *
 * ### Why `react-ui` keeps its own, and that is NOT this duplicate
 *
 * `react-ui/src/results/ResultsHeaderView.tsx` declares a third `FilterSummary`, and it stays.
 * `react-ui` is the dumb presentational tier: its package description forbids engine, state-library
 * and browser-global imports, and it does not depend on `@filter-enginez/core` at all. So it cannot
 * name {@link RuleId} and types its own `ruleId` as a bare `string`.
 *
 * The two are structurally compatible only because `RuleId` happens to BE `string`. That is a
 * coincidence worth leaving in place rather than removing: react-ui's is the VIEW contract, this is
 * the ENGINE-facing one, and the whole point of that package is that it does not know an engine
 * exists. If `RuleId` ever became a branded type, react-ui's declaration is what would keep the
 * presentational tier from having to care.
 *
 * @packageDocumentation
 */

import type { RuleId } from '@filter-enginez/core';

/** One active-filter chip's display data. */
export interface FilterSummary {
	/** Whether the value should render in the numeric (tabular-nums) chip style. */
	readonly isNumeric: boolean;
	/** Human label, e.g. `'Genre'` or `'Price'`. */
	readonly label: string;
	/** The rule id — the opaque key the remove callback maps back to. */
	readonly ruleId: RuleId;
	/** The formatted value, e.g. `'fantasy (+2 more)'`, `'$250,000 — $900,000'`, `'3 required'`. */
	readonly value: string;
}
