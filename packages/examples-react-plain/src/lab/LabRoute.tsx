/**
 * `<LabRoute />` — the `/lab` route element.
 *
 * @remarks
 * Renders the lab over the books engine by handing `<DatasetRoute>` a synthesized `DatasetEntry`,
 * so the boot path — lazy boot, progress loader, error screen, provider — is reused rather than
 * duplicated.
 *
 * @packageDocumentation
 */

import { NotFoundPage } from '@filter-enginez/examples-shared/notfound';

import { findDataset } from '../datasets.js';
import { DatasetRoute } from '../routes/DatasetRoute.js';
import { buildLabEntry } from './labEntry.js';
import { LabPage } from './LabPage.js';

/**
 * The lab's dataset entry, resolved ONCE at module load.
 *
 * @remarks
 * 🔴 **Module scope is the whole point — see {@link buildLabEntry}.** `DatasetRoute`'s boot effect
 * is keyed on entry identity, so an entry rebuilt per render re-boots forever, silently and without
 * a thrown error. `labRoute.test.tsx` asserts `boot` is called exactly once across re-renders,
 * because a comment cannot stop the next person inlining this for readability.
 *
 * @internal
 */
const labEntry = buildLabEntry(findDataset('books'), LabPage);

/**
 * Route element for `/lab`. Falls back to the shared 404 when the books dataset is absent.
 */
export const LabRoute = (): React.ReactElement => {
	if (labEntry === null) {
		return <NotFoundPage />;
	}

	return <DatasetRoute entry={labEntry} />;
};
