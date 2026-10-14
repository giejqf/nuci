// SPDX-License-Identifier: Apache-2.0
// Public DNS-over-HTTPS resolvers offered as presets (RFC 8484 endpoints and
// the plain DNS servers that resolve their host names at start).

export type Variant = 'malware' | 'family' | 'adblock' | 'unfiltered';
export interface Provider {
	id: string;
	name: string;
	variant?: Variant;
	url: string;
	bootstrap: string;
}

export const PROVIDERS: Provider[] = [
	{
		id: 'cloudflare',
		name: 'Cloudflare',
		url: 'https://cloudflare-dns.com/dns-query',
		bootstrap: '1.1.1.1,1.0.0.1,2606:4700:4700::1111,2606:4700:4700::1001',
	},
	{
		id: 'cloudflare-security',
		name: 'Cloudflare',
		variant: 'malware',
		url: 'https://security.cloudflare-dns.com/dns-query',
		bootstrap: '1.1.1.2,1.0.0.2,2606:4700:4700::1112,2606:4700:4700::1002',
	},
	{
		id: 'cloudflare-family',
		name: 'Cloudflare',
		variant: 'family',
		url: 'https://family.cloudflare-dns.com/dns-query',
		bootstrap: '1.1.1.3,1.0.0.3,2606:4700:4700::1113,2606:4700:4700::1003',
	},
	{
		id: 'google',
		name: 'Google',
		url: 'https://dns.google/dns-query',
		bootstrap: '8.8.8.8,8.8.4.4,2001:4860:4860::8888,2001:4860:4860::8844',
	},
	{
		id: 'quad9',
		name: 'Quad9',
		variant: 'malware',
		url: 'https://dns.quad9.net/dns-query',
		bootstrap: '9.9.9.9,149.112.112.112,2620:fe::fe,2620:fe::9',
	},
	{
		id: 'quad9-unfiltered',
		name: 'Quad9',
		variant: 'unfiltered',
		url: 'https://dns10.quad9.net/dns-query',
		bootstrap: '9.9.9.10,149.112.112.10,2620:fe::10,2620:fe::fe:10',
	},
	{
		id: 'adguard',
		name: 'AdGuard',
		variant: 'adblock',
		url: 'https://dns.adguard-dns.com/dns-query',
		bootstrap: '94.140.14.14,94.140.15.15,2a10:50c0::ad1:ff,2a10:50c0::ad2:ff',
	},
	{
		id: 'adguard-unfiltered',
		name: 'AdGuard',
		variant: 'unfiltered',
		url: 'https://unfiltered.adguard-dns.com/dns-query',
		bootstrap: '94.140.14.140,94.140.14.141,2a10:50c0::1:ff,2a10:50c0::2:ff',
	},
	{
		id: 'mullvad',
		name: 'Mullvad',
		url: 'https://dns.mullvad.net/dns-query',
		bootstrap: '194.242.2.2,2a07:e340::2',
	},
	{
		id: 'opendns',
		name: 'OpenDNS',
		url: 'https://doh.opendns.com/dns-query',
		bootstrap: '208.67.222.222,208.67.220.220,2620:119:35::35,2620:119:53::53',
	},
	{
		id: 'dnssb',
		name: 'DNS.SB',
		url: 'https://doh.dns.sb/dns-query',
		bootstrap: '185.222.222.222,45.11.45.11,2a09::,2a11::',
	},
	{
		id: 'alidns',
		name: 'AliDNS',
		url: 'https://dns.alidns.com/dns-query',
		bootstrap: '223.5.5.5,223.6.6.6,2400:3200::1,2400:3200:baba::1',
	},
	{
		id: 'dnspod',
		name: 'DNSPod',
		url: 'https://doh.pub/dns-query',
		bootstrap: '119.29.29.29,1.12.12.12',
	},
];

export const providerOf = (url: string | undefined) =>
	url ? PROVIDERS.find((p) => p.url === url.replace(/\/+$/, '')) : undefined;
