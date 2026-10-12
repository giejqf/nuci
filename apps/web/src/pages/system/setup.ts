// SPDX-License-Identifier: Apache-2.0
//
// Data for the setup wizard (AGENTS.md Phase 14).

/** Internet connection types the wizard offers, with the options it asks for. */
export const WIZARD_PROTOS: { id: string; options: string[] }[] = [
	{ id: 'dhcp', options: [] },
	{ id: 'pppoe', options: ['username', 'password'] },
	{ id: 'static', options: ['ipaddr', 'gateway', 'dns'] },
];

/** Protected encryptions for a radio band, preferred first (6 GHz requires WPA3). */
export function wifiEncryptions(band: unknown): string[] {
	return band === '6g' ? ['sae'] : ['sae-mixed', 'psk2', 'sae'];
}

/** Regulatory country from the browser language (`de-DE` → `DE`), if it names one. */
export function countrySuggestion(language: string | undefined): string | null {
	const region = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Z]{2})\b/i.exec(language ?? '')?.[1];
	return region ? region.toUpperCase() : null;
}
