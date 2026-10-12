// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { endpoint, KEY_RE, networkOf, peerConfig } from './peer-config';

const K = 'cGVyc29uYWwga2V5IGZvciB0ZXN0aW5nIG9ubHkhIUE=';

describe('peer config', () => {
	it('renders wg-quick format', () => {
		expect(
			peerConfig({
				privateKey: K,
				addresses: ['10.9.0.2/32'],
				dns: ['10.9.0.1'],
				serverPublicKey: K,
				presharedKey: K,
				endpoint: endpoint('vpn.example.net', 51820),
				allowedIps: ['0.0.0.0/0', '::/0'],
				keepalive: 25,
			}),
		).toBe(
			`[Interface]\nPrivateKey = ${K}\nAddress = 10.9.0.2/32\nDNS = 10.9.0.1\n\n[Peer]\nPublicKey = ${K}\nPresharedKey = ${K}\nEndpoint = vpn.example.net:51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25\n`,
		);
	});

	it('brackets IPv6 endpoints, computes networks, checks keys', () => {
		expect(endpoint('2001:db8::1', 51820)).toBe('[2001:db8::1]:51820');
		expect(networkOf('10.9.0.1/24')).toBe('10.9.0.0/24');
		expect(networkOf('192.168.5.77/30')).toBe('192.168.5.76/30');
		expect(KEY_RE.test(K)).toBe(true);
		expect(KEY_RE.test('short')).toBe(false);
	});
});
