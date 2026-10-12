// SPDX-License-Identifier: Apache-2.0
//
// nuci.wifi — associated stations with hostnames, and a radio scan wrapper.
//
// rpcd itself provides the iwinfo object, so a synchronous ubus call from
// here would deadlock until it times out. Every iwinfo call is deferred and
// the method returns the deferred request; rpcd replies when the chain ends.

'use strict';

import { access } from 'fs';
import { connect } from 'ubus';
import { cursor } from 'uci';
import { methods, STATUS } from 'nuci.rpc';
import { default_run } from 'nuci.util';
import { known_hosts, merge_stations, parse_iw_dev, parse_iw_scan, RADIO_RE, SCAN_IFACE } from 'nuci.wifi';

let bus = null;

function iw(method, args, cb) {
	bus ??= connect();

	return bus.defer('iwinfo', method, args ?? {}, (rc, data) => cb(data ?? {}));
}

return {
	'nuci.wifi': methods({
		// netifd rejects the ubus_rpc_session argument uhttpd adds to every
		// call, so the browser cannot ask network.wireless directly. netifd
		// is a separate process: a synchronous call is safe here.
		status: {
			call: () => {
				bus ??= connect();

				return bus.call('network.wireless', 'status', {}) ?? {};
			}
		},
		assoc_list_enriched: {
			call: (args, req) => {
				let known = known_hosts({ uci: cursor() });
				let out = [];

				return iw('devices', {}, (d) => {
					let devs = d.devices ?? [];

					function step(i) {
						if (i >= length(devs))
							return req.reply({ stations: out });

						iw('info', { device: devs[i] }, (info) =>
							iw('assoclist', { device: devs[i] }, (al) => {
								push(out, ...merge_stations(devs[i], info, al.results, known));
								step(i + 1);
							}));
					}

					step(0);
				});
			}
		},
		scan: {
			args: { radio: 'radio' },
			call: (args, req) => {
				if (type(args.radio) != 'string' || !match(args.radio, RADIO_RE))
					return STATUS.INVALID_ARGUMENT;

				return iw('scan', { device: args.radio }, (r) => {
					if (length(r.results ?? []))
						return req.reply({ results: r.results });

					// The radio has no interface that can scan.
					iw('phyname', { section: args.radio }, (p) => {
						if (!p.phyname)
							return req.error(STATUS.NOT_FOUND);

						if (!access('/usr/sbin/iw'))
							return req.reply({ results: [] });

						// An AP on this phy: scan on it with ap-force (a second
						// interface would get EBUSY while hostapd runs).
						let ap = filter(parse_iw_dev(default_run([ 'iw', 'dev' ])),
							i => i.phy == p.phyname && i.type == 'AP')[0];

						if (ap)
							return req.reply({ results: parse_iw_scan(default_run([ 'iw', 'dev', ap.ifname, 'scan', 'ap-force' ])) });

						// No interface at all: use a temporary managed one.
						default_run([ 'iw', 'phy', p.phyname, 'interface', 'add', SCAN_IFACE, 'type', 'managed' ]);
						default_run([ 'ip', 'link', 'set', SCAN_IFACE, 'up' ]);

						iw('scan', { device: SCAN_IFACE }, (r2) => {
							default_run([ 'iw', 'dev', SCAN_IFACE, 'del' ]);
							req.reply({ results: r2.results ?? [] });
						});
					});
				});
			}
		}
	})
};
