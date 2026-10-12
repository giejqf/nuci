// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { UciModel, UciStore } from '@nuci/uci';
import { FakeRpcdUci, fixtureConfigs } from '../../uci/src/test/fake-rpcd';
import DynamicList from './DynamicList.svelte';
import Host from './test/Host.svelte';

const host = (props: Record<string, unknown>) => render(Host, { props: props as never });
import TextField from './TextField.svelte';
import Toggle from './Toggle.svelte';
import Select from './Select.svelte';
import { cidr4, hostname } from './validators';

let store: UciStore;

beforeEach(async () => {
	store = new UciStore(new UciModel(new FakeRpcdUci(fixtureConfigs())));
	await store.load('system', 'network');
});

describe('TextField bound to uci', () => {
	it('shows the staged value and stages edits', async () => {
		host({
			ctx: { uci: store },
			component: TextField,
			with: { label: 'Hostname', uci: 'system.@system[0].hostname' },
		});
		const input = screen.getByLabelText('Hostname') as HTMLInputElement;
		expect(input.value).toBe('OpenWrt');
		await fireEvent.input(input, { target: { value: 'router' } });
		expect(store.get('system', '@system[0]', 'hostname')).toBe('router');
		expect(store.changes).toHaveLength(1);
		expect(store.model.getBase('system', 'cfg01e48a', 'hostname')).toBe('OpenWrt');
	});

	it('joins list values for display', () => {
		host({
			ctx: { uci: store },
			component: TextField,
			with: { label: 'IP', uci: 'network.lan.ipaddr' },
		});
		expect((screen.getByLabelText('IP') as HTMLInputElement).value).toBe('192.168.1.1/24');
	});

	it('displays validation errors and marks the form invalid', async () => {
		host({
			ctx: { uci: store },
			component: TextField,
			with: { label: 'Hostname', uci: 'system.@system[0].hostname', validate: hostname },
		});
		const input = screen.getByLabelText('Hostname');
		await fireEvent.input(input, { target: { value: 'bad host!' } });
		flushSync();
		expect(screen.getByRole('alert').textContent).toBe('Enter a valid hostname.');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByTestId('form-valid').textContent).toBe('false');
		await fireEvent.input(input, { target: { value: 'good-host' } });
		flushSync();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByTestId('form-valid').textContent).toBe('true');
	});

	it('is read-only when the ACL forbids writing the config', () => {
		host({
			ctx: { uci: store, canWrite: (c: string) => c !== 'system' },
			component: TextField,
			with: { label: 'Hostname', uci: 'system.@system[0].hostname' },
		});
		expect((screen.getByLabelText('Hostname') as HTMLInputElement).readOnly).toBe(true);
	});

	it('works without uci via bind:value', async () => {
		host({ ctx: { uci: store }, component: TextField, with: { label: 'Free', value: 'x' } });
		const input = screen.getByLabelText('Free') as HTMLInputElement;
		expect(input.value).toBe('x');
		await fireEvent.input(input, { target: { value: 'y' } });
		expect(store.changes).toHaveLength(0);
	});
});

describe('Toggle', () => {
	it('stores on/off and unsets when returning to the default', async () => {
		host({
			ctx: { uci: store },
			component: Toggle,
			with: { label: 'NTP server', uci: 'system.ntp.enable_server', default: false },
		});
		const box = screen.getByLabelText('NTP server') as HTMLInputElement;
		expect(box.checked).toBe(false);
		await fireEvent.click(box);
		expect(store.get('system', 'ntp', 'enable_server')).toBe('1');
		await fireEvent.click(box);
		expect(store.get('system', 'ntp', 'enable_server')).toBeUndefined();
		expect(store.changes).toHaveLength(0);
	});

	it('reads existing values', () => {
		host({
			ctx: { uci: store },
			component: Toggle,
			with: { label: 'NTP', uci: 'system.ntp.enabled' },
		});
		expect((screen.getByLabelText('NTP') as HTMLInputElement).checked).toBe(true);
	});
});

describe('Select', () => {
	it('stages the chosen option', async () => {
		host({
			ctx: { uci: store },
			component: Select,
			with: {
				label: 'Protocol',
				uci: 'network.wan.proto',
				options: [
					{ value: 'dhcp', label: 'DHCP' },
					{ value: 'static', label: 'Static' },
				],
			},
		});
		const sel = screen.getByLabelText('Protocol') as HTMLSelectElement;
		expect(sel.value).toBe('dhcp');
		await fireEvent.change(sel, { target: { value: 'static' } });
		expect(store.get('network', 'wan', 'proto')).toBe('static');
	});
});

describe('DynamicList', () => {
	it('adds and removes list entries with validation', async () => {
		host({
			ctx: { uci: store },
			component: DynamicList,
			with: { label: 'Addresses', uci: 'network.lan.ipaddr', validate: cidr4 },
		});
		const draft = screen.getByLabelText('New entry for Addresses');
		await fireEvent.input(draft, { target: { value: '10.0.0.1/33' } });
		expect(screen.getByRole('alert').textContent).toContain('IPv4');
		expect((screen.getByLabelText('Add entry') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.input(draft, { target: { value: '10.0.0.1/24' } });
		await fireEvent.click(screen.getByLabelText('Add entry'));
		expect(store.get('network', 'lan', 'ipaddr')).toEqual(['192.168.1.1/24', '10.0.0.1/24']);
		await fireEvent.click(screen.getByLabelText('Remove 192.168.1.1/24'));
		expect(store.get('network', 'lan', 'ipaddr')).toEqual(['10.0.0.1/24']);
	});
});
