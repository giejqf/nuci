// SPDX-License-Identifier: Apache-2.0
// Axis helpers: clean tick values and compact labels.

/** Round `max` up to a clean axis maximum and return `count`+1 ticks from `min`. */
export function niceTicks(min: number, max: number, count = 4): number[] {
	if (!Number.isFinite(max) || max <= min) max = min + 1;
	const raw = (max - min) / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
	const ticks: number[] = [];
	for (let v = min; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
	if (ticks.length < 2) ticks.push(min + step);
	return ticks;
}

/** 0 / 950 / 1.2K / 3.4M style compact numbers. */
export function compact(n: number): string {
	const abs = Math.abs(n);
	const fmt = (v: number, s: string) => `${Number(v.toFixed(v < 10 ? 1 : 0))}${s}`;
	if (abs >= 1e9) return fmt(n / 1e9, 'G');
	if (abs >= 1e6) return fmt(n / 1e6, 'M');
	if (abs >= 1e3) return fmt(n / 1e3, 'K');
	return String(Number(n.toFixed(abs < 10 && abs % 1 ? 2 : 0)));
}
