// SPDX-License-Identifier: Apache-2.0
//
// Client-side configuration for a peer (wg-quick format), built in the
// browser from the staged uci data; nothing is sent anywhere.

export interface PeerConfig {
	/** The peer's own private key (stored in its uci section for export). */
	privateKey: string;
	/** The peer's tunnel addresses (its allowed_ips on the router). */
	addresses: string[];
	dns: string[];
	/** The router's tunnel public key. */
	serverPublicKey: string;
	presharedKey?: string;
	/** host:port the peer connects to. */
	endpoint: string;
	/** What the peer routes into the tunnel. */
	allowedIps: string[];
	keepalive?: number;
}

export function peerConfig(c: PeerConfig): string {
	const lines = ['[Interface]', `PrivateKey = ${c.privateKey}`];
	if (c.addresses.length) lines.push(`Address = ${c.addresses.join(', ')}`);
	if (c.dns.length) lines.push(`DNS = ${c.dns.join(', ')}`);
	lines.push('', '[Peer]', `PublicKey = ${c.serverPublicKey}`);
	if (c.presharedKey) lines.push(`PresharedKey = ${c.presharedKey}`);
	lines.push(`Endpoint = ${c.endpoint}`, `AllowedIPs = ${c.allowedIps.join(', ')}`);
	if (c.keepalive) lines.push(`PersistentKeepalive = ${c.keepalive}`);
	return lines.join('\n') + '\n';
}

/** `host:port` with IPv6 literals bracketed. */
export function endpoint(host: string, port: number | string): string {
	return host.includes(':') && !host.startsWith('[') ? `[${host}]:${port}` : `${host}:${port}`;
}

export const KEY_RE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;

/** Network part of an interface address: 10.9.0.1/24 -> 10.9.0.0/24 (IPv4 only). */
export function networkOf(cidr: string): string {
	const [ip, len] = cidr.split('/');
	const n = Number(len);
	const parts = (ip ?? '').split('.').map(Number);
	if (parts.length !== 4 || !(n >= 0 && n <= 32)) return cidr;
	const v = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
	const net = n === 0 ? 0 : (v & (0xffffffff << (32 - n))) >>> 0;
	return `${[net >>> 24, (net >>> 16) & 255, (net >>> 8) & 255, net & 255].join('.')}/${n}`;
}
