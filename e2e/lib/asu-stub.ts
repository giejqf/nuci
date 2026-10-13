// SPDX-License-Identifier: Apache-2.0
//
// A stand-in for the OpenWrt build service (ASU) and the download server,
// with just what owut uses (ADR-0007): overview.json, profiles.json, the
// package indexes, POST /api/v1/build (answered at once) and the image.
// It offers one newer release ("to") whose packages are the router's
// installed ones with base-files bumped, and serves a prebuilt image.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { basename, join } from 'node:path';

export interface AsuStub {
	url: string;
	/** Build requests received (the JSON owut posted). */
	builds: Record<string, unknown>[];
	close(): Promise<void>;
}

export interface AsuStubOptions {
	port: number;
	/** Address the router reaches the host on (QEMU user net: 10.0.2.2). */
	publicHost: string;
	/** Sysupgrade image to hand out (.img.gz). */
	image: string;
	from: string;
	to: string;
	/** Installed packages on the router: name → version. */
	installed: Record<string, string>;
}

const FIXTURES = join(import.meta.dirname, '../fixtures/asu');

/** A version owut sorts after `v`: bump its leading number. */
function bump(v: string): string {
	return v.replace(/^(\d+)/, (n) => String(Number(n) + 1));
}

export async function startAsuStub(o: AsuStubOptions): Promise<AsuStub> {
	const url = `http://${o.publicHost}:${o.port}`;
	const image = readFileSync(o.image);
	const imageName = basename(o.image);
	const sha256 = createHash('sha256').update(image).digest('hex');
	const profiles = JSON.parse(readFileSync(join(FIXTURES, 'profiles-armsr-armv8.json'), 'utf8'));
	const versionCode = 'r99999-0000000000';

	profiles.version_number = o.to;
	profiles.version_code = versionCode;
	profiles.profiles.generic.images = [
		{
			filesystem: 'squashfs',
			type: 'combined-efi',
			name: imageName,
			sha256,
			size: image.length,
		},
	];

	const index: Record<string, string> = {};
	for (const name of [...profiles.default_packages, ...profiles.profiles.generic.device_packages])
		index[name] = '1';
	Object.assign(index, o.installed);
	if (index['base-files']) index['base-files'] = bump(index['base-files']);

	const overview = {
		latest: [o.to],
		upstream_url: url,
		server: { max_custom_rootfs_size_mb: 1024, max_defaults_length: 20480 },
		branches: {
			[o.to.replace(/^(\d+\.\d+).*/, '$1')]: {
				name: o.to.replace(/^(\d+\.\d+).*/, '$1'),
				path: 'releases/{version}',
				enabled: true,
				snapshot: false,
				versions: [o.to, o.from],
				targets: [profiles.target],
				package_changes: [],
			},
		},
	};

	const builds: Record<string, unknown>[] = [];
	const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	};
	const target = profiles.target as string;
	const rel = `releases/${o.to}`;

	const server: Server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', url).pathname;
		if (req.method === 'POST' && path === '/api/v1/build') {
			let body = '';
			req.on('data', (c) => (body += c));
			req.on('end', () => {
				const request = JSON.parse(body) as {
					packages?: string[];
					packages_versions?: Record<string, string>;
					version_code?: string;
				};
				builds.push(request);
				const manifest =
					request.packages_versions ??
					Object.fromEntries((request.packages ?? []).map((p) => [p, index[p]]));
				json(res, 200, {
					status: 200,
					detail: 'done',
					request_hash: 'e2e',
					bin_dir: 'e2e',
					build_at: new Date().toISOString(),
					version_number: o.to,
					version_code: request.version_code || versionCode,
					images: profiles.profiles.generic.images,
					manifest,
					request,
				});
			});
			return;
		}
		if (path === '/json/v1/overview.json') return json(res, 200, overview);
		if (path === `/${rel}/targets/${target}/profiles.json`) return json(res, 200, profiles);
		if (path === `/json/v1/${rel}/packages/${profiles.arch_packages}-index.json`)
			return json(res, 200, index);
		if (path === `/json/v1/${rel}/targets/${target}/index.json`)
			return json(res, 200, { architecture: profiles.arch_packages, packages: {} });
		if (path === `/store/e2e/${imageName}`) {
			res.writeHead(200, {
				'content-type': 'application/octet-stream',
				'content-length': image.length,
			});
			return res.end(image);
		}
		json(res, 404, { detail: 'not found' }); // e.g. the faillogs: none
	});

	await new Promise<void>((resolve) => server.listen(o.port, '0.0.0.0', resolve));
	return {
		url,
		builds,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
