// SPDX-License-Identifier: Apache-2.0
// A minimal RFC 8484 DNS-over-HTTPS resolver for e2e (apps3.spec.ts): answers
// A queries for the names it is given, NXDOMAIN for everything else. Its
// certificate comes from a throwaway CA made with openssl for this run; the
// router trusts that CA through https-dns-proxy's ca_certs_file.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createSecureServer, type Http2ServerRequest, type Http2ServerResponse } from 'node:http2';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DohStub {
	url: string;
	/** PEM of the CA that signed the server certificate. */
	ca: string;
	/** Names asked so far (lower case, without the trailing dot). */
	queries: string[];
	close(): Promise<void>;
}

function certificates(ip: string) {
	const dir = mkdtempSync(join(tmpdir(), 'nuci-doh-'));
	const f = (n: string) => join(dir, n);
	const ssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });
	try {
		const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes'];
		ssl(
			'req',
			'-x509',
			...ec,
			'-keyout',
			f('ca.key'),
			'-out',
			f('ca.pem'),
			'-days',
			'2',
			'-subj',
			'/CN=nuci-e2e-ca',
		);
		ssl('req', ...ec, '-keyout', f('srv.key'), '-out', f('srv.csr'), '-subj', `/CN=${ip}`);
		writeFileSync(
			f('ext'),
			`subjectAltName=IP:${ip}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n`,
		);
		ssl(
			'x509',
			'-req',
			'-in',
			f('srv.csr'),
			'-CA',
			f('ca.pem'),
			'-CAkey',
			f('ca.key'),
			'-CAcreateserial',
			'-out',
			f('srv.pem'),
			'-days',
			'2',
			'-extfile',
			f('ext'),
		);
		return {
			ca: readFileSync(f('ca.pem'), 'utf8'),
			cert: readFileSync(f('srv.pem')),
			key: readFileSync(f('srv.key')),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Question name and type of a DNS query; the question ends at `end`. */
function question(msg: Buffer): { name: string; qtype: number; end: number } | null {
	let off = 12;
	const labels: string[] = [];
	while (off < msg.length) {
		const len = msg[off]!;
		if (len === 0) break;
		if (len > 63) return null;
		labels.push(msg.subarray(off + 1, off + 1 + len).toString('latin1'));
		off += 1 + len;
	}
	if (off + 5 > msg.length) return null;
	return { name: labels.join('.').toLowerCase(), qtype: msg.readUInt16BE(off + 1), end: off + 5 };
}

function answer(query: Buffer, records: Record<string, string>): Buffer | null {
	const q = question(query);
	if (!q || query.readUInt16BE(4) !== 1) return null;
	const ip = records[q.name];
	const a = ip && q.qtype === 1;
	const head = Buffer.alloc(12);
	query.copy(head, 0, 0, 2); // ID
	// QR, RD from the query, RA; NXDOMAIN for unknown names.
	head.writeUInt16BE(0x8180 | (query.readUInt16BE(2) & 0x0100) | (ip ? 0 : 3), 2);
	head.writeUInt16BE(1, 4);
	head.writeUInt16BE(a ? 1 : 0, 6);
	const parts = [head, query.subarray(12, q.end)];
	if (a) {
		const rr = Buffer.alloc(16);
		rr.writeUInt16BE(0xc00c, 0); // name: pointer to the question
		rr.writeUInt16BE(1, 2); // A
		rr.writeUInt16BE(1, 4); // IN
		rr.writeUInt32BE(60, 6);
		rr.writeUInt16BE(4, 10);
		ip.split('.').forEach((o, i) => rr.writeUInt8(Number(o), 12 + i));
		parts.push(rr);
	}
	return Buffer.concat(parts);
}

export async function startDohStub(opts: {
	port: number;
	/** Address the router reaches this host on (and the certificate is for). */
	publicHost: string;
	records: Record<string, string>;
}): Promise<DohStub> {
	const { ca, cert, key } = certificates(opts.publicHost);
	const queries: string[] = [];
	const reply = (res: Http2ServerResponse, body: Buffer | null) => {
		if (!body) return void res.writeHead(400).end();
		res.writeHead(200, {
			'content-type': 'application/dns-message',
			'cache-control': 'max-age=0',
		});
		res.end(body);
	};
	const server = createSecureServer(
		{ cert, key, allowHTTP1: true },
		(req: Http2ServerRequest, res) => {
			const url = new URL(req.url, 'https://stub');
			if (url.pathname !== '/dns-query') return void res.writeHead(404).end();
			const handle = (msg: Buffer) => {
				const q = question(msg);
				if (q) queries.push(q.name);
				reply(res, answer(msg, opts.records));
			};
			if (req.method === 'GET') {
				const dns = url.searchParams.get('dns');
				return handle(Buffer.from(dns ?? '', 'base64url'));
			}
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => handle(Buffer.concat(chunks)));
		},
	);
	// The proxy keeps its connection open: close() ends them.
	const sockets = new Set<import('node:tls').TLSSocket>();
	server.on('secureConnection', (s) => {
		sockets.add(s);
		s.on('close', () => sockets.delete(s));
	});
	await new Promise<void>((resolve) => server.listen(opts.port, '0.0.0.0', resolve));
	return {
		url: `https://${opts.publicHost}:${opts.port}/dns-query`,
		ca,
		queries,
		close: () =>
			new Promise((resolve) => {
				server.close(() => resolve());
				for (const s of sockets) s.destroy();
			}),
	};
}
