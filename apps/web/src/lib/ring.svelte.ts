// SPDX-License-Identifier: Apache-2.0
//
// Fixed-size history of samples for realtime charts: one time axis and any
// number of named series kept aligned with it (missing values are null).

export class Ring {
	times = $state<number[]>([]);
	series = $state<Record<string, (number | null)[]>>({});
	readonly max: number;

	constructor(max = 120) {
		this.max = max;
	}

	push(time: number, values: Record<string, number | null | undefined>): void {
		const n = this.times.length;
		const next: Record<string, (number | null)[]> = {};
		const keys = [
			...Object.keys(this.series),
			...Object.keys(values).filter((k) => !(k in this.series)),
		];
		for (const key of keys) {
			const old = this.series[key] ?? Array<number | null>(n).fill(null);
			const v = values[key];
			next[key] = [...old, v === undefined ? null : v].slice(-this.max);
		}
		this.series = next;
		this.times = [...this.times, time].slice(-this.max);
	}

	get(key: string): (number | null)[] {
		return this.series[key] ?? this.times.map(() => null);
	}
}
