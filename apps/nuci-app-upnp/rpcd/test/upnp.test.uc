// SPDX-License-Identifier: Apache-2.0
'use strict';

import { test, eq, here, done } from 'harness';
import { uci_stub, ubus_stub } from 'stubs';
import { status } from 'nuci.app.upnp';

const root = here() + '/../../apps/nuci-app-upnp/rpcd/test/fixtures/root';

test('status: procd instance state and parsed leases', () => {
	let s = status({
		root,
		uci: uci_stub({ upnpd: { config: { '.type': 'upnpd' } } }),
		ubus: ubus_stub({ 'service.list': { miniupnpd: { instances: { instance1: { running: true } } } } }),
	});
	eq(s.running, true);
	eq(s.redirects, [
		{ proto: 'TCP', external_port: 40000, client: '192.168.1.2', internal_port: 40000, expires: 1791798024, description: 'nuci-e2e' },
		{ proto: 'UDP', external_port: 3478, client: '192.168.1.50', internal_port: 3478, expires: 0, description: 'game: with colon' },
	]);
});

test('an unsafe lease file path falls back to the default', () => {
	let s = status({ root, uci: uci_stub({ upnpd: { config: { upnp_lease_file: '/etc/shadow' } } }), ubus: ubus_stub({}) });
	eq(s.running, false);
	eq(length(s.redirects), 2);
});

done();
