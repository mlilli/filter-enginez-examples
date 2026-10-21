/**
 * `DatasetBootError` — a route resolver's engine boot that failed, told apart from a page that did not
 * load.
 *
 * @remarks
 * `/books` and `/real-estate` boot their engines in route resolvers, and a resolver that rejects ends
 * the navigation with `NavigationError` — exactly as a page chunk that did not download does. The two
 * deserve different screens: a failed boot gets the dataset's boot-failure screen (`BOOT_FAILURE_COPY`,
 * the same words in every app), a missing chunk the shared page-error screen. So each resolver wraps
 * the BOOT, and only the boot, in {@link withDatasetBootFailure}; the root component reads the class off
 * the navigation error and picks the screen.
 *
 * Its own module, imported by `app.routes.ts` and `app.component.ts`, so neither the engine nor a
 * dataset module joins the startup chunks.
 *
 * @packageDocumentation
 */

import type { BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';

/** A dataset engine that could not start. */
export class DatasetBootError extends Error {
	/** The dataset whose engine failed. */
	public readonly dataset: BootFailureDataset;

	/**
	 * Wrap a boot failure.
	 *
	 * @param dataset - The dataset whose engine failed.
	 * @param cause - What the boot threw; its message becomes this error's.
	 */
	public constructor(dataset: BootFailureDataset, cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.name = 'DatasetBootError';
		this.dataset = dataset;
	}
}

/**
 * Await a dataset's engine boot, turning a failure into a {@link DatasetBootError}.
 *
 * @typeParam T - What the boot resolves to.
 * @param dataset - The dataset being booted.
 * @param boot - The boot.
 * @returns The boot's value.
 * @throws A {@link DatasetBootError} when the boot rejects.
 */
export async function withDatasetBootFailure<T>(dataset: BootFailureDataset, boot: Promise<T>): Promise<T> {
	try {
		return await boot;
	} catch (caught: unknown) {
		throw new DatasetBootError(dataset, caught);
	}
}
