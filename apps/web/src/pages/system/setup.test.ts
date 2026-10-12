// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { proto } from '../network/proto-registry';
import { countrySuggestion, wifiEncryptions, WIZARD_PROTOS } from './setup';

describe('setup wizard data', () => {
	it('only asks for options the protocol registry defines', () => {
		for (const p of WIZARD_PROTOS) {
			const known = proto(p.id)?.fields.map((f) => f.option) ?? [];
			expect(known.length || p.id === 'dhcp').toBeTruthy();
			for (const o of p.options) expect(known).toContain(o);
		}
	});

	it('offers WPA3 only on 6 GHz', () => {
		expect(wifiEncryptions('6g')).toEqual(['sae']);
		expect(wifiEncryptions('2g')[0]).toBe('sae-mixed');
		expect(wifiEncryptions(undefined)).toContain('psk2');
	});

	it('suggests the country from the browser language', () => {
		expect(countrySuggestion('de-DE')).toBe('DE');
		expect(countrySuggestion('zh-Hans-CN')).toBe('CN');
		expect(countrySuggestion('en-us')).toBe('US');
		expect(countrySuggestion('de')).toBeNull();
		expect(countrySuggestion(undefined)).toBeNull();
		expect(countrySuggestion('es-419')).toBeNull();
	});
});
