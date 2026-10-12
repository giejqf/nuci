// SPDX-License-Identifier: Apache-2.0
// Locale-aware formatting helpers shared by pages.

import { getLocale } from '@nuci/i18n';

export function formatBytes(n: number | null | undefined, digits = 1): string {
	if (n == null || !Number.isFinite(n)) return '—';
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
	let i = 0;
	let v = Math.abs(n);
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${(n < 0 ? -v : v).toLocaleString(getLocale(), { maximumFractionDigits: i ? digits : 0 })} ${units[i]}`;
}

/** Bits per second from a byte rate. */
export function formatRate(bytesPerSecond: number | null | undefined): string {
	if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return '—';
	const units = ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s'];
	let v = bytesPerSecond * 8;
	let i = 0;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${v.toLocaleString(getLocale(), { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds)) return '—';
	const s = Math.floor(seconds);
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const parts: [number, string][] = d
		? [
				[d, 'day'],
				[h, 'hour'],
				[m, 'minute'],
			]
		: h
			? [
					[h, 'hour'],
					[m, 'minute'],
					[sec, 'second'],
				]
			: m
				? [
						[m, 'minute'],
						[sec, 'second'],
					]
				: [[sec, 'second']];
	// Localised unit abbreviations ("3d 4h", "3 T. 4 Std.", "3天4小时").
	return parts
		.map(([n, unit]) =>
			new Intl.NumberFormat(getLocale(), {
				style: 'unit',
				unit,
				unitDisplay: 'narrow',
			}).format(n),
		)
		.join(' ');
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
	if (fraction == null || !Number.isFinite(fraction)) return '—';
	return fraction.toLocaleString(getLocale(), {
		style: 'percent',
		maximumFractionDigits: digits,
	});
}

export function formatDateTime(epochSeconds: number | null | undefined): string {
	if (epochSeconds == null) return '—';
	return new Date(epochSeconds * 1000).toLocaleString(getLocale());
}

/** Compress an IPv6 address (RFC 5952: drop leading zeros, longest zero run → ::). */
export function formatAddress(addr: string): string {
	if (!addr.includes(':')) return addr;
	const groups = addr.toLowerCase().split(':');
	if (groups.length !== 8 || addr.includes('::')) return addr.toLowerCase();
	const short = groups.map((g) => g.replace(/^0+(?=.)/, ''));
	let best = -1;
	let bestLen = 1;
	for (let i = 0; i < 8;) {
		if (short[i] !== '0') {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && short[j] === '0') j++;
		if (j - i > bestLen) {
			best = i;
			bestLen = j - i;
		}
		i = j;
	}
	if (best < 0) return short.join(':');
	return `${short.slice(0, best).join(':')}::${short.slice(best + bestLen).join(':')}`;
}
