// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-uhttpd: the web server's running listeners (procd), details of
// its TLS certificate (a small X.509 reader: PEM or DER, as px5g writes
// it), and a new self-signed certificate as a detached job.

'use strict';

import { access, readfile } from 'fs';
import { context } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';
import { STATUS } from 'nuci.rpc';

const NAME = 'uhttpd';
const INIT = '/etc/init.d/uhttpd';
const DEFAULT_CERT = '/etc/uhttpd.crt';
const DEFAULT_KEY = '/etc/uhttpd.key';
const PATH_RE = /^\/[A-Za-z0-9._\/-]+$/;
const GENERATORS = [ '/usr/sbin/px5g', '/usr/bin/openssl' ];

const OIDS = {
	'2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU',
	'1.2.840.113549.1.1.1': 'RSA',
	'1.2.840.10045.2.1': 'EC',
	'1.3.101.112': 'Ed25519',
	'1.2.840.10045.3.1.7': 'P-256',
	'1.3.132.0.34': 'P-384',
	'1.3.132.0.35': 'P-521',
};

// One DER element at `off`: { tag, start (of the content), end }.
function tlv(s, off) {
	if (off + 2 > length(s))
		return null;

	let tag = ord(s, off);
	let len = ord(s, off + 1);
	let p = off + 2;

	if (len & 0x80) {
		let n = len & 0x7f;

		if (n < 1 || n > 3 || p + n > length(s))
			return null;

		len = 0;

		for (let i = 0; i < n; i++)
			len = (len << 8) | ord(s, p + i);

		p += n;
	}

	return (p + len <= length(s)) ? { tag, start: p, end: p + len } : null;
}

// The elements inside a constructed element.
function children(s, el) {
	let out = [];

	for (let off = el.start; off < el.end; ) {
		let c = tlv(s, off);

		if (!c || c.end > el.end)
			break;

		push(out, c);
		off = c.end;
	}

	return out;
}

function content(s, el) {
	return substr(s, el.start, el.end - el.start);
}

function oid(s, el) {
	let out = [];
	let v = 0;

	for (let i = el.start; i < el.end; i++) {
		let b = ord(s, i);

		v = (v << 7) | (b & 0x7f);

		if (b & 0x80)
			continue;

		if (!length(out)) {
			let first = (v < 80) ? int(v / 40) : 2;
			push(out, first, v - first * 40);
		}
		else
			push(out, v);

		v = 0;
	}

	return join('.', out);
}

function hex(s) {
	return join('', map(split(s, ''), c => sprintf('%02x', ord(c))));
}

// UTCTime (YYMMDDhhmmssZ) or GeneralizedTime (YYYYMMDDhhmmssZ) -> epoch seconds.
function time_of(s, el) {
	let t = content(s, el);
	let m = (el.tag == 0x17)
		? match(t, /^([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})Z$/)
		: match(t, /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})Z$/);

	if (!m)
		return null;

	let year = +m[1];

	if (el.tag == 0x17)
		year += (year < 50) ? 2000 : 1900;

	return timegm({ year, mon: +m[2], mday: +m[3], hour: +m[4], min: +m[5], sec: +m[6] });
}

// Name -> "CN=OpenWrt, O=…" (attributes in certificate order).
function name_of(s, el) {
	let parts = [];

	for (let set in children(s, el))
		for (let atv in children(s, set)) {
			let kv = children(s, atv);

			if (length(kv) == 2 && kv[0].tag == 0x06)
				push(parts, `${OIDS[oid(s, kv[0])] ?? oid(s, kv[0])}=${content(s, kv[1])}`);
		}

	return join(', ', parts);
}

function key_of(s, spki) {
	let parts = children(s, spki);
	let alg = parts[0], bits = parts[1];
	let a = alg ? children(s, alg) : [];
	let kind = (length(a) && a[0].tag == 0x06) ? OIDS[oid(s, a[0])] : null;

	if (kind == 'EC')
		return 'EC ' + ((a[1]?.tag == 0x06) ? (OIDS[oid(s, a[1])] ?? oid(s, a[1])) : '?');

	if (kind == 'RSA' && bits?.tag == 0x03) {
		// BIT STRING: one byte of unused bits, then SEQUENCE { modulus, exponent }
		let seq = tlv(s, bits.start + 1);
		let n = seq ? children(s, seq)[0] : null;

		if (n) {
			let len = n.end - n.start;

			if (len > 0 && ord(s, n.start) == 0)
				len--;

			return `RSA ${len * 8}`;
		}
	}

	return kind;
}

// PEM (first certificate) or DER -> details, or null.
function parse_cert(data) {
	if (type(data) != 'string' || !length(data))
		return null;

	let der = data;
	let pem = match(data, /-----BEGIN CERTIFICATE-----([^-]+)-----END CERTIFICATE-----/);

	if (pem)
		der = b64dec(replace(pem[1], /\s+/g, ''));
	else if (index(data, '-----BEGIN') >= 0)
		return null;

	let cert = tlv(der, 0);
	let tbs = cert ? children(der, cert)[0] : null;
	let f = tbs ? children(der, tbs) : [];

	// [0] version is optional
	if (length(f) && f[0].tag == 0xa0)
		f = slice(f, 1);

	if (length(f) < 6 || f[0].tag != 0x02 || f[3].tag != 0x30 || f[5].tag != 0x30)
		return null;

	let validity = children(der, f[3]);
	let subject = name_of(der, f[4]);
	let issuer = name_of(der, f[2]);

	return {
		format: pem ? 'pem' : 'der',
		// without the sign byte DER adds to a positive serial with the top bit set
		serial: replace(hex(content(der, f[0])), /^00([89a-f])/, '$1'),
		subject,
		issuer,
		self_signed: subject == issuer,
		not_before: validity[0] ? time_of(der, validity[0]) : null,
		not_after: validity[1] ? time_of(der, validity[1]) : null,
		key: key_of(der, f[5]),
	};
}

// What uhttpd's init script makes certificates with (px5g preferred).
function generator(c) {
	for (let g in GENERATORS)
		if (access(c.root + g, 'x'))
			return replace(g, /^.*\//, '');

	return null;
}

function plain_path(p, dflt) {
	p ??= dflt;

	return (type(p) == 'string' && match(p, PATH_RE) && index(p, '..') < 0) ? p : null;
}

function status(ctx) {
	let c = context(ctx);

	let svc = c.ubus?.call('service', 'list', { name: NAME })?.[NAME];
	let instances = [];

	for (let n, inst in svc?.instances ?? {}) {
		let cmd = inst.command ?? [];
		let http = [], https = [];

		for (let i = 0; i + 1 < length(cmd); i++)
			if (cmd[i] == '-p')
				push(http, cmd[i + 1]);
			else if (cmd[i] == '-s')
				push(https, cmd[i + 1]);

		push(instances, { name: n, running: !!inst.running, http, https });
	}

	let path = plain_path(c.uci?.get(NAME, 'main', 'cert'), DEFAULT_CERT);

	return {
		running: length(filter(instances, i => i.running)) > 0,
		instances,
		cert: path ? { path, ...(parse_cert(readfile(c.root + path)) ?? { missing: true }) } : null,
		generator: generator(c),
		job: job_status(c, NAME),
	};
}

// Remove the certificate and key; uhttpd makes new ones from the "cert"
// section when it starts with HTTPS listeners. Restarting uhttpd ends the
// request that asked for it, hence the delay.
function regenerate(ctx) {
	let c = context(ctx);
	let cert = plain_path(c.uci?.get(NAME, 'main', 'cert'), DEFAULT_CERT);
	let key = plain_path(c.uci?.get(NAME, 'main', 'key'), DEFAULT_KEY);

	if (!cert || !key || !generator(c))
		return STATUS.NOT_SUPPORTED;

	// The paths are arguments to the fixed script, never part of it.
	return start(c, NAME, [ '/bin/sh', '-c', 'sleep 1; rm -f "$1" "$2"; exec "$0" restart', INIT, cert, key ]);
}

export { parse_cert, status, regenerate };
