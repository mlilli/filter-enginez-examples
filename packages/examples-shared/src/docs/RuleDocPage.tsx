/**
 * `<RuleDocPage />` — renders one `RuleDoc` (`/docs/rules/:ruleId`): the simple → advanced
 * explanation, the animated rule figure, real code, and prev/next navigation. Pure template over the
 * `RULE_DOCS` catalog.
 *
 * @packageDocumentation
 */

// The figures' stylesheet, loaded with this page rather than with the app: the eight algorithm
// illustrations and the rule figure are the only `fe-fig-*` markup, and only the two figure pages draw
// it. Imported here, the bundler puts the sheet beside this page's chunk and links it when the page
// loads, after the app's own sheet, which is the order the cascade needs (`figures.css` builds on the
// brand tokens and overrides nothing in `ui-styles`). The documentation site and both React apps'
// `/docs` routes all get it this way, and none of them carries it on any other page.
import '@filter-enginez/ui-styles/figures.css';

import { Link, Navigate, useParams } from 'react-router';

import { CodeBlock } from './CodeBlock.js';
import { findRuleDoc, RULE_DOCS } from './content/rulesContent.js';
import { RuleFigure } from './figures/RuleFigure.js';

/**
 * A single rule's documentation page.
 */
export const RuleDocPage = (): React.ReactElement => {
	const { ruleId } = useParams();
	const rule = findRuleDoc(ruleId);

	if (rule === undefined) {
		return <Navigate to="/docs" replace />;
	}

	const index = RULE_DOCS.findIndex((candidate) => candidate.id === rule.id);
	const previous = index > 0 ? RULE_DOCS[index - 1] : undefined;
	const next = index < RULE_DOCS.length - 1 ? RULE_DOCS[index + 1] : undefined;

	return (
		<article className="fe-doc">
			<p className="fe-doc-eyebrow">filter rule</p>
			<h1 className="fe-doc-title">{rule.name}</h1>

			<div className="fe-doc-meta">
				<span className="fe-doc-chip fe-doc-chip--cyan">{rule.factory}()</span>
				<span className={`fe-doc-chip ${rule.serializable ? 'fe-doc-chip--cyan' : 'fe-doc-chip--warn'}`}>
					{rule.serializable ? 'serializable' : 'not serializable'}
				</span>
			</div>

			<p className="fe-doc-lead">{rule.simple}</p>

			<div className="fe-doc-figure">
				<RuleFigure spec={rule.figure} />
			</div>

			<h2 className="fe-doc-h2">How it works</h2>
			<p className="fe-doc-p">{rule.advanced}</p>

			<h2 className="fe-doc-h2">Example</h2>
			{rule.examples.map((example) => (
				<div key={example.code}>
					{example.caption === undefined ? null : <p className="fe-doc-code-caption">{example.caption}</p>}
					<CodeBlock code={example.code} ariaLabel={`${rule.name} code example`} />
				</div>
			))}

			<p className="fe-doc-p">
				<Link to="/docs/playground">Try the engine live in the playground →</Link>
			</p>

			{rule.seeAlso === undefined || rule.seeAlso.length === 0 ? null : (
				<>
					<h2 className="fe-doc-h2">See also</h2>
					<ul className="fe-doc-see-also">
						{rule.seeAlso.map((relatedId) => {
							const related = findRuleDoc(relatedId);

							return related === undefined ? null : (
								<li key={relatedId}>
									<Link to={`/docs/rules/${related.id}`}>{related.name}</Link> — {related.tagline}
								</li>
							);
						})}
					</ul>
				</>
			)}

			<nav className="fe-doc-pager" aria-label="Rule pages">
				{previous === undefined ? <span /> : <Link to={`/docs/rules/${previous.id}`}>← {previous.name}</Link>}
				{next === undefined ? <span /> : <Link to={`/docs/rules/${next.id}`}>{next.name} →</Link>}
			</nav>
		</article>
	);
};
