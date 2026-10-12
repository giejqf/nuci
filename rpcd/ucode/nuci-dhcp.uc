// SPDX-License-Identifier: Apache-2.0
//
// nuci.dhcp — merged DHCP leases (dnsmasq + odhcpd) and known hosts.

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods } from 'nuci.rpc';
import { leases, hosts } from 'nuci.dhcp';

function with_ctx(fn) {
	let bus = connect();
	let res = fn({ ubus: bus, uci: cursor() });

	bus?.disconnect();

	return res;
}

return {
	'nuci.dhcp': methods({
		leases: { call: () => ({ leases: with_ctx(leases) }) },
		hosts: { call: () => ({ hosts: with_ctx(hosts) }) }
	})
};
