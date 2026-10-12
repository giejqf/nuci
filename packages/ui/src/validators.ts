// SPDX-License-Identifier: Apache-2.0
//
// Field validators. Each returns null when valid, else an i18n key.
// The server validates again (AGENTS.md §5); these are for fast feedback.

export type Validator = (value: string) => string | null;

export const required: Validator = (v) => (v.trim() === '' ? 'validate.required' : null);

export const hostname: Validator = (v) =>
	v === '' ||
	(/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(
		v,
	) &&
		v.length <= 253)
		? null
		: 'validate.hostname';

function isIpv4(v: string): boolean {
	const parts = v.split('.');
	return (
		parts.length === 4 &&
		parts.every((p) => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255)
	);
}

function isIpv6(v: string): boolean {
	if (!/^[0-9A-Fa-f:.]+$/.test(v) || v.split('::').length > 2) return false;
	const [head = '', tail] = v.split('::');
	const groups = (s: string) => (s === '' ? [] : s.split(':'));
	const all = [...groups(head), ...(tail === undefined ? [] : groups(tail))];
	const last = all.at(-1);
	const v4tail = last !== undefined && last.includes('.') ? (isIpv4(last) ? 2 : -99) : 0;
	const hex = v4tail ? all.slice(0, -1) : all;
	if (v4tail < 0 || !hex.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
	const count = hex.length + v4tail;
	return tail === undefined ? count === 8 : count < 8;
}

export const ipv4: Validator = (v) => (v === '' || isIpv4(v) ? null : 'validate.ipv4');
export const ipv6: Validator = (v) => (v === '' || isIpv6(v) ? null : 'validate.ipv6');
export const ipaddr: Validator = (v) =>
	v === '' || isIpv4(v) || isIpv6(v) ? null : 'validate.ipaddr';

/** IPv4 with optional /prefix (0-32). */
export const cidr4: Validator = (v) => {
	if (v === '') return null;
	const [ip = '', prefix, extra] = v.split('/');
	if (extra !== undefined || !isIpv4(ip)) return 'validate.cidr4';
	if (prefix !== undefined && !(/^[0-9]{1,2}$/.test(prefix) && Number(prefix) <= 32))
		return 'validate.cidr4';
	return null;
};

/** IPv6 with a mandatory /prefix (0-128). */
export const cidr6: Validator = (v) => {
	if (v === '') return null;
	const [ip = '', prefix, extra] = v.split('/');
	if (extra !== undefined || prefix === undefined || !isIpv6(ip)) return 'validate.cidr6';
	if (!(/^[0-9]{1,3}$/.test(prefix) && Number(prefix) <= 128)) return 'validate.cidr6';
	return null;
};

/** IPv6 address or DNS name (e.g. an AFTR). */
export const ipv6OrHost: Validator = (v) =>
	v === '' || isIpv6(v) || hostname(v) === null ? null : 'validate.ipv6_or_host';

export function integer(min = -Infinity, max = Infinity): Validator {
	return (v) => {
		if (v === '') return null;
		if (!/^-?[0-9]+$/.test(v)) return 'validate.integer';
		const n = Number(v);
		return n < min || n > max ? 'validate.range' : null;
	};
}

export const port: Validator = (v) => integer(1, 65535)(v) && 'validate.port';

/** A port or a range "1000-2000". */
export const portRange: Validator = (v) => {
	if (v === '') return null;
	const m = /^([0-9]+)(?:[-:]([0-9]+))?$/.exec(v);
	if (!m) return 'validate.port_range';
	const a = Number(m[1]);
	const b = m[2] === undefined ? a : Number(m[2]);
	return a >= 1 && b <= 65535 && a <= b ? null : 'validate.port_range';
};

/** IPv4/IPv6 address, optionally with a prefix ("10.0.0.0/8"). */
export const ipOrCidr: Validator = (v) => {
	if (v === '') return null;
	const [ip = '', prefix, extra] = v.split('/');
	if (extra !== undefined || ipaddr(ip)) return 'validate.ip_or_cidr';
	const max = ip.includes(':') ? 128 : 32;
	return prefix === undefined || (/^[0-9]{1,3}$/.test(prefix) && Number(prefix) <= max)
		? null
		: 'validate.ip_or_cidr';
};

/** Run validators in order; the first failure wins. */
export function all(...vs: Validator[]): Validator {
	return (v) => {
		for (const f of vs) {
			const r = f(v);
			if (r) return r;
		}
		return null;
	};
}
