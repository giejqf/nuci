// SPDX-License-Identifier: Apache-2.0

export interface Series {
	id: string;
	label: string;
	/** Categorical slot 1-4 (fixed per entity, so filters never repaint survivors). */
	slot: 1 | 2 | 3 | 4;
	values: (number | null)[];
}
