// SPDX-License-Identifier: Apache-2.0
//
// uci references: "network.lan.ipaddr", "system.@system[0].hostname",
// "firewall.@zone[-1]" (option optional).

export interface UciRef {
	config: string;
	/** Section name, or an `@type[index]` selector to resolve against the mirror. */
	section: string;
	option?: string;
}

const NAME = '[A-Za-z0-9_]+';
const SELECTOR = `@${NAME}\\[-?[0-9]+\\]`;
const REF_RE = new RegExp(`^(${NAME})\\.(${NAME}|${SELECTOR})(?:\\.(${NAME}))?$`);
const SELECTOR_RE = /^@([A-Za-z0-9_]+)\[(-?[0-9]+)\]$/;

export function parseRef(ref: string): UciRef {
	const m = REF_RE.exec(ref);
	if (!m) throw new Error(`invalid uci reference: ${ref}`);
	const out: UciRef = { config: m[1]!, section: m[2]! };
	if (m[3]) out.option = m[3];
	return out;
}

export function parseSelector(section: string): { type: string; index: number } | null {
	const m = SELECTOR_RE.exec(section);
	return m ? { type: m[1]!, index: Number(m[2]) } : null;
}

export function isValidName(name: string): boolean {
	return /^[A-Za-z0-9_]+$/.test(name);
}

/** Section types may contain '-' (wifi-iface, wifi-device). */
export function isValidType(type: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(type);
}
