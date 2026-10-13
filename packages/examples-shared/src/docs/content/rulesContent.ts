// cspell:ignore Tolkein tolkein — deliberate misspellings demonstrating typo-tolerant fuzzy search.
/**
 * The filter-rule catalog as documentation data — 15 concrete rules + `CompositeRule`. Each entry
 * drives one `/docs/rules/:id` page. Code examples use only the real ergonomic factories from
 * `@filter-enginez/core` (`packages/core/src/rules/factories.ts` + `composition/factories.ts`), so a
 * reader can paste them and have them mean something.
 *
 * @packageDocumentation
 */

import { type RuleDoc } from './types.js';

/** Every documented rule, in sidebar order (grouped by kind). */
export const RULE_DOCS: readonly RuleDoc[] = [
	{
		advanced:
			'Uses strict `===` after field extraction. Passing `undefined` as the target makes the rule inert (matches everything), which is how a UI represents "no selection". For membership over a set of allowed values, reach for `InSetRule` instead; `ValueRule` is the single-value special case.',
		examples: [{ code: "engine.addRule('color', value('color', 'red'))" }],
		factory: 'value',
		figure: {
			cells: [
				{ label: 'red', pass: true },
				{ label: 'white', pass: false },
				{ label: 'red', pass: true },
				{ label: 'rosé', pass: false },
				{ label: 'red', pass: true },
			],
			predicate: 'color === "red"',
		},
		group: 'value',
		id: 'value',
		name: 'ValueRule',
		seeAlso: ['in-set', 'boolean'],
		serializable: true,
		simple: 'Passes records whose field exactly equals a single configured value.',
		tagline: 'exact equality',
	},
	{
		advanced:
			'A thin convenience over `ValueRule` for `boolean` fields — it exists so a checkbox/toggle UI reads naturally (`bool("isInPrint", true)`). Passing `undefined` clears the constraint. Because booleans have only two states, pair it with predictive-disable if you want to grey out a toggle that would empty the results.',
		examples: [{ code: "engine.addRule('in-print', bool('isInPrint', true))" }],
		factory: 'bool',
		figure: {
			cells: [
				{ label: 'isInPrint: true', pass: true },
				{ label: 'isInPrint: false', pass: false },
				{ label: 'isInPrint: true', pass: true },
				{ label: 'isInPrint: false', pass: false },
			],
			predicate: 'isInPrint === true',
		},
		group: 'value',
		id: 'boolean',
		name: 'BooleanRule',
		seeAlso: ['value'],
		serializable: true,
		simple: 'A boolean-field convenience: passes records whose flag equals the configured value.',
		tagline: 'boolean equality',
	},
	{
		advanced:
			'Bounds are inclusive; use `Infinity` / `-Infinity` for an open end. A range over a **nullable** field silently excludes nulls even at its full extent (it reads as a no-op but still filters), so model "maybe missing" fields with `ExistsRule` + a range, not a range alone. Ranges feed the histogram + slider-bound derivation in `applyFiltersAndQuery`.',
		examples: [{ code: "engine.addRule('price', range('price', { min: 20, max: 60 }))" }],
		factory: 'range',
		figure: {
			cells: [
				{ label: '$45', pass: true },
				{ label: '$12', pass: false },
				{ label: '$58', pass: true },
				{ label: '$90', pass: false },
				{ label: '$33', pass: true },
				{ label: '$8', pass: false },
			],
			predicate: '20 ≤ price ≤ 60',
		},
		group: 'range',
		id: 'range',
		name: 'RangeRule',
		seeAlso: ['numeric-comparison', 'date-range'],
		serializable: true,
		simple: 'Passes records whose numeric field falls within an inclusive [min, max] range.',
		tagline: 'inclusive numeric range',
	},
	{
		advanced:
			'One of six operators (`>`, `>=`, `<`, `<=`, `==`, `!=`) against a single threshold — the "one-sided" complement to `RangeRule`. Ideal for "points ≥ 90" style gates where only one bound matters. Non-numeric or missing field values fail the comparison rather than throwing.',
		examples: [{ code: "engine.addRule('points', numCompare('points', { op: '>=', value: 90 }))" }],
		factory: 'numCompare',
		figure: {
			cells: [
				{ label: '92 pts', pass: true },
				{ label: '88 pts', pass: false },
				{ label: '95 pts', pass: true },
				{ label: '90 pts', pass: true },
				{ label: '84 pts', pass: false },
			],
			predicate: 'points >= 90',
		},
		group: 'range',
		id: 'numeric-comparison',
		name: 'NumericComparisonRule',
		seeAlso: ['range'],
		serializable: true,
		simple: 'Passes records whose numeric field satisfies a single comparison operator against a value.',
		tagline: 'one-operator numeric compare',
	},
	{
		advanced:
			'Accepts explicit `{ start, end }` Date bounds **or** a relative `preset` (`last-7-days`, `last-30-days`, `last-90-days`, `this-month`, `this-year`, `all-time`) resolved at evaluation time — so a "last 7 days" filter stays correct as the clock moves. It coerces ISO strings, Unix-ms numbers, and `Date` instances. Serializes dates to ISO and revives them via a custom `deserialize` hook.',
		examples: [
			{ caption: 'Relative preset (resolved when the rule runs):', code: "engine.addRule('listed', dateRange('listedAt', { preset: 'last-7-days' }))" },
			{ caption: 'Explicit bounds:', code: "engine.addRule('listed', dateRange('listedAt', { start: new Date('2024-01-01'), end: new Date('2024-06-30') }))" },
		],
		factory: 'dateRange',
		figure: {
			cells: [
				{ label: '2 days ago', pass: true },
				{ label: '3 weeks ago', pass: false },
				{ label: 'yesterday', pass: true },
				{ label: 'last year', pass: false },
				{ label: 'today', pass: true },
			],
			predicate: 'listedAt within last 7 days',
		},
		group: 'range',
		id: 'date-range',
		name: 'DateRangeRule',
		seeAlso: ['range'],
		serializable: true,
		simple: 'Passes records whose date field falls in a range — with live relative presets like "last 7 days".',
		tagline: 'date range + relative presets',
	},
	{
		advanced:
			'The workhorse facet filter — an empty set is inert (no constraint), and selecting values ORs them together (`red` OR `white`). Backed by the Roaring-bitmap intersection path and the mutual-exclusion graph, so a large multi-select stays sub-millisecond and predictive-disable can grey out options that would empty the results.',
		examples: [{ code: "engine.addRule('genre', inSet('genre', ['Fantasy', 'Sci-Fi']))" }],
		factory: 'inSet',
		figure: {
			cells: [
				{ label: 'Fantasy', pass: true },
				{ label: 'Mystery', pass: false },
				{ label: 'Sci-Fi', pass: true },
				{ label: 'Romance', pass: false },
				{ label: 'Fantasy', pass: true },
				{ label: 'History', pass: false },
			],
			predicate: 'genre ∈ { Fantasy, Sci-Fi }',
		},
		group: 'set',
		id: 'in-set',
		name: 'InSetRule',
		seeAlso: ['in-set-of-sets', 'hierarchical', 'value'],
		serializable: true,
		simple: 'Passes records whose field value is in a configured set (a multi-select facet).',
		tagline: 'value in a set',
	},
	{
		advanced:
			'Like `InSetRule` but the configuration is a set OF sets — a record passes if its value is in ANY subset. It models "super-groups" (e.g. a "Speculative" group = Fantasy ∪ Sci-Fi ∪ Horror) where selecting the group selects all its members without enumerating them in the UI.',
		examples: [{ code: "engine.addRule('genre', inSetofSets('genre', [['Fantasy', 'Sci-Fi', 'Horror'], ['Mystery', 'Thriller']]))" }],
		factory: 'inSetofSets',
		figure: {
			cells: [
				{ label: 'Fantasy', pass: true },
				{ label: 'Mystery', pass: true },
				{ label: 'Romance', pass: false },
				{ label: 'Horror', pass: true },
				{ label: 'History', pass: false },
			],
			predicate: 'genre ∈ (Speculative ∪ Crime)',
		},
		group: 'set',
		id: 'in-set-of-sets',
		name: 'InSetofSetsRule',
		seeAlso: ['in-set', 'hierarchical'],
		serializable: true,
		simple: 'Passes records whose value is in ANY of several configured subsets (super-groups).',
		tagline: 'value in any of many sets',
	},
	{
		advanced:
			'Filters against a tree of categories with **descendant inclusion**: selecting a parent node matches items in it and all of its children. Configured with a `tree` structure + the `selected` node ids. Perfect for a metro→neighborhood or country→region→appellation hierarchy where one click should include the whole subtree.',
		examples: [{ code: "engine.addRule('origin', hierarchical('origin', { tree: originTree, selected: ['france/burgundy'] }))" }],
		factory: 'hierarchical',
		figure: {
			cells: [
				{ label: 'france/burgundy/chablis', pass: true },
				{ label: 'italy/tuscany', pass: false },
				{ label: 'france/burgundy', pass: true },
				{ label: 'usa/california', pass: false },
				{ label: 'france/burgundy/beaune', pass: true },
			],
			predicate: 'origin ⊆ france/burgundy',
		},
		group: 'set',
		id: 'hierarchical',
		name: 'HierarchicalRule',
		seeAlso: ['in-set-of-sets', 'in-set'],
		serializable: true,
		simple: 'Passes records under a selected category — including all of its descendants in the tree.',
		tagline: 'tree filter with descendant inclusion',
	},
	{
		advanced:
			'Zero-dependency string matching in six modes: `exact`, `substring`, `startsWith`, `endsWith`, `tokenized`, and `allWords` (all query words must appear as whole words). The `allWords` mode is served authoritatively by the inverted text index when engaged; substring stays on native `String.includes` (already faster than an index). An empty query is inert.',
		examples: [{ code: "engine.addRule('notes', text('description', { query: 'buttery oak', mode: 'allWords' }))" }],
		factory: 'text',
		figure: {
			cells: [
				{ label: '"…buttery, with oak…"', pass: true },
				{ label: '"crisp and mineral"', pass: false },
				{ label: '"oak and buttery notes"', pass: true },
				{ label: '"bright citrus"', pass: false },
			],
			predicate: 'description has all of { buttery, oak }',
		},
		group: 'text',
		id: 'text-search',
		name: 'TextSearchRule',
		seeAlso: ['fuzzy-search', 'regex'],
		serializable: true,
		simple: 'Passes records whose text field matches a query in one of six modes (substring, whole-word, …).',
		tagline: 'zero-dep text matching',
	},
	{
		advanced:
			'Typo-tolerant search via Fuse.js with a tunable `threshold` (0 = exact, 1 = match anything). When the inverted index is engaged it pre-filters candidates with a sound character-trigram bound before the exact Fuse confirm, so fuzzy search over large corpora stays fast without changing results. Use it for author / title search where users misspell.',
		examples: [{ code: "engine.addRule('author', fuzzy('authors', { query: 'tolkein', threshold: 0.3 }))" }],
		factory: 'fuzzy',
		figure: {
			cells: [
				{ label: 'Tolkien', pass: true },
				{ label: 'Le Guin', pass: false },
				{ label: 'Tolkein', pass: true },
				{ label: 'Herbert', pass: false },
				{ label: 'Tolkein, J.', pass: true },
			],
			predicate: 'authors ≈ "tolkein" (fuzzy)',
		},
		group: 'text',
		id: 'fuzzy-search',
		name: 'FuzzySearchRule',
		seeAlso: ['text-search', 'regex'],
		serializable: true,
		simple: 'Passes records whose text field is a close (typo-tolerant) match for the query.',
		tagline: 'typo-tolerant search',
	},
	{
		advanced:
			'Full `RegExp` matching. Configured with a live `{ pattern: RegExp }`; because a `RegExp` is not JSON, it serializes to `{ source, flags }` and revives via `new RegExp(...)` in a custom `deserialize` hook — so patterns round-trip through config / URL. An empty pattern matches everything (a neutral default for an "advanced filter" input).',
		examples: [{ code: "engine.addRule('isbn', regex('isbn13', { pattern: /^978/ }))" }],
		factory: 'regex',
		figure: {
			cells: [
				{ label: '9780007117116', pass: true },
				{ label: '9791234567897', pass: false },
				{ label: '9780451524935', pass: true },
				{ label: '9798765432109', pass: false },
			],
			predicate: 'isbn13 matches /^978/',
		},
		group: 'text',
		id: 'regex',
		name: 'RegexRule',
		seeAlso: ['text-search', 'fuzzy-search'],
		serializable: true,
		simple: 'Passes records whose string field matches a regular expression.',
		tagline: 'regular-expression match',
	},
	{
		advanced:
			'Within-radius geographic filter. Configured with a center `{ lat, lng }` + `radiusKm`; the engine indexes coordinates in an R-tree, so a radius query prunes whole bounding-box branches before computing an exact haversine distance on the survivors. This is the one filter where the spatial index turns a linear scan into a sub-millisecond query.',
		examples: [{ code: "engine.addRule('near', geo('coords', { lat: 37.77, lng: -122.42, radiusKm: 8 }))" }],
		factory: 'geo',
		figure: {
			cells: [
				{ label: '2.1 km away', pass: true },
				{ label: '14 km away', pass: false },
				{ label: '5.6 km away', pass: true },
				{ label: '31 km away', pass: false },
				{ label: '7.9 km away', pass: true },
			],
			predicate: 'within 8 km of (37.77, −122.42)',
		},
		group: 'spatial',
		id: 'geo-proximity',
		name: 'GeoProximityRule',
		serializable: true,
		simple: 'Passes records whose coordinates fall within a radius of a center point.',
		tagline: 'within-radius geo filter',
	},
	{
		advanced:
			'Passes records whose extracted field value is not `null`/`undefined` — the "has a value" gate. Note it ALWAYS filters (an active `ExistsRule` is never neutral), so a config that includes one boots pre-filtered; that is a filter STATE, by design. Handy for "rated only" / "has a photo" toggles over nullable fields.',
		examples: [{ code: "engine.addRule('has-rating', exists('averageRating'))" }],
		factory: 'exists',
		figure: {
			cells: [
				{ label: 'averageRating: 4.2', pass: true },
				{ label: 'averageRating: null', pass: false },
				{ label: 'averageRating: 3.8', pass: true },
				{ label: 'averageRating: null', pass: false },
				{ label: 'averageRating: 4.9', pass: true },
			],
			predicate: 'averageRating is present',
		},
		group: 'special',
		id: 'exists',
		name: 'ExistsRule',
		seeAlso: ['range', 'predicate'],
		serializable: true,
		simple: 'Passes records whose field has a non-null value (a "has a value" gate).',
		tagline: 'field is present',
	},
	{
		advanced:
			'The escape hatch: an arbitrary consumer predicate `(item, rule) => boolean`. It cannot be serialized (a closure has no JSON form), so it will not round-trip through config / URL / worker. When you need a custom rule that DOES round-trip, extend the abstract `FilterRule`, put the state in a plain-object `config`, declare a `static override readonly ruleTypeName` matching the name you register under, and register the subclass with `ruleRegistry` — exactly what the real-estate demo does with its `ContainsAllRule`. The static is what makes the rule survive a minified production build; omit it and `register` will not compile.',
		examples: [
			{ code: "engine.addRule('many-features', predicate('features', (item) => item.features.length >= 3))" },
			{ caption: 'For a serializable custom rule, extend FilterRule + register it:', code: "class ContainsAllRule extends FilterRule {\n  static override readonly ruleTypeName = 'ContainsAllRule' // required, and a literal\n  /* plain-object config */\n}\nruleRegistry.register('ContainsAllRule', ContainsAllRule)" },
		],
		factory: 'predicate',
		figure: {
			cells: [
				{ label: '4 features', pass: true },
				{ label: '1 feature', pass: false },
				{ label: '3 features', pass: true },
				{ label: '2 features', pass: false },
				{ label: '6 features', pass: true },
			],
			predicate: 'item.features.length ≥ 3',
		},
		group: 'special',
		id: 'predicate',
		name: 'PredicateRule',
		seeAlso: ['composite', 'bloom-membership'],
		serializable: false,
		simple: 'The escape hatch: passes records for which an arbitrary function returns true.',
		tagline: 'arbitrary predicate (not serializable)',
	},
	{
		advanced:
			'Probabilistic set membership via a serialized bit-array: "definitely not a member" or "probably a member" — never a false negative, with a tunable false-positive rate. It takes a PREBUILT `BloomFilter` (built once offline via `BloomFilter.forCapacity(n, p)` + `add(String(key))`) and probes with the same `String(...)` keying. A cheap pre-screen for membership sets too large to ship inline; pair it with an exact check where a false positive would be wrong.',
		examples: [{ code: "const picks = BloomFilter.forCapacity(5000, 0.01)\nfor (const id of editorsPickIds) picks.add(String(id))\nengine.addRule('picks', bloomMembership('id', picks))" }],
		factory: 'bloomMembership',
		figure: {
			cells: [
				{ label: 'id 4417', pass: true },
				{ label: 'id 9902', pass: false },
				{ label: 'id 1180', pass: true },
				{ label: 'id 7731', pass: false },
			],
			predicate: 'id ∈ Bloom(editorsPicks)',
		},
		group: 'special',
		id: 'bloom-membership',
		name: 'BloomMembershipRule',
		seeAlso: ['in-set', 'predicate'],
		serializable: true,
		simple: 'A probabilistic pre-screen: "definitely not" or "probably yes" membership from a compact bit-array.',
		tagline: 'probabilistic set membership',
	},
	{
		advanced:
			'Full Boolean algebra over the other rules. `and(...)`, `or(...)`, and `not(...)` compose rules (and each other, nested arbitrarily) into a `CompositeRule` you hand to `engine.setExpression(...)` — the engine\'s "expression mode", the alternative to the default implicit-AND flat-map. This is how you express "(red OR white) AND NOT sparkling" in one tree.',
		examples: [{ code: "import { and, or, not, inSet, range } from '@filter-enginez/core'\n\nengine.setExpression(\n  and(\n    or(inSet('color', ['red']), inSet('color', ['white'])),\n    not(inSet('style', ['sparkling'])),\n  ),\n)" }],
		factory: 'and / or / not',
		figure: {
			cells: [
				{ label: 'red, still', pass: true },
				{ label: 'red, sparkling', pass: false },
				{ label: 'white, still', pass: true },
				{ label: 'rosé, still', pass: false },
				{ label: 'white, sparkling', pass: false },
			],
			predicate: '(red ∨ white) ∧ ¬sparkling',
		},
		group: 'composite',
		id: 'composite',
		name: 'CompositeRule',
		serializable: true,
		simple: 'Combines other rules with AND / OR / NOT into a full Boolean expression tree.',
		tagline: 'Boolean composition (and / or / not)',
	},
];

/** Look up a rule doc by its route id. */
export function findRuleDoc(id: string | undefined): RuleDoc | undefined {
	return RULE_DOCS.find((rule) => rule.id === id);
}
