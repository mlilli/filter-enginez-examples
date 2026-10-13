/**
 * `@filter-enginez/examples-shared/docs` — the shared documentation-site slice.
 *
 * @remarks
 * A data-driven docs section (shell + rule/algorithm pages + playground + API reference) mounted as a
 * `/docs` layout route in each React app, so the docs are part of the same site as `/about` and the
 * dataset demos. All content lives in `./content/*`; the pages are pure templates. Browser-only.
 *
 * @packageDocumentation
 */

export { ALGORITHM_DOCS, findAlgorithmDoc } from './content/algorithmsContent.js';
export { API_GROUPS, type ApiEntry, type ApiGroup } from './content/apiContent.js';
export { findRuleDoc, RULE_DOCS } from './content/rulesContent.js';
export { type AlgorithmDoc, type CodeExample, type RuleDoc, type RuleFigureSpec, type RuleGroup } from './content/types.js';
export { AlgorithmDocPage } from './AlgorithmDocPage.js';
export { CodeBlock, type CodeBlockProps } from './CodeBlock.js';
export { DocsApiPage } from './DocsApiPage.js';
export { DocsHomePage } from './DocsHomePage.js';
export { DocsLayout } from './DocsLayout.js';
export { DocsPlaygroundPage } from './DocsPlaygroundPage.js';
export { docsRoute } from './docsRoutes.js';
export { RuleDocPage } from './RuleDocPage.js';
export { RuleFigure } from './figures/RuleFigure.js';
