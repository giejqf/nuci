// SPDX-License-Identifier: Apache-2.0
//
// nuci-app-asu: attended sysupgrade through owut (ADR-0007). Everything slow
// runs as the detached job "asu" (/usr/libexec/nuci/asu); this module starts
// it with validated arguments and summarizes what owut left in its state dir.

'use strict';

import { stat } from 'fs';
import { context, read, read_trim } from 'nuci.util';
import { start, status as job_status } from 'nuci.job';

const STATE = '/tmp/nuci-asu';
const HELPER = '/usr/libexec/nuci/asu';
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

function load_json(ctx, path) {
	let s = read(ctx, path);

	try {
		return s ? json(s) : null;
	}
	catch (e) {
		return null;
	}
}

// What the page needs from `owut dump -v -v` and `owut check`.
function summarize(dump, check_text, check_rc) {
	if (type(dump) != 'object')
		return null;

	let changes = [], missing = [];

	for (let name, p in dump.packageDB ?? {}) {
		if (p.new_version == null)
			push(missing, name);
		else if (p.new_version != p.version)
			push(changes, { name, from: p.version, to: p.new_version });
	}

	let branches = {};

	for (let b, data in dump.release?.branches ?? {})
		branches[b] = { latest: data.latest, versions: data.versions ?? [] };

	let errors = [], warnings = [];

	for (let line in split(check_text ?? '', '\n')) {
		let m = match(line, /^(ERROR|WARNING): (.*)$/);

		// `check` only warns about downgrades, but `download` refuses them
		// without --force (which is not offered): an error here.
		if (m)
			push((m[1] == 'ERROR' || match(m[2], /downgrade/i)) ? errors : warnings, m[2]);
	}

	let side = (s) => s ? { version: s.version, revision: s.rev_code, kernel: s.kernel } : null;

	return {
		from: side(dump.build?.from),
		to: side(dump.build?.to),
		device: {
			target: dump.device?.target,
			profile: dump.device?.platform,
			board: dump.device?.board,
		},
		branches,
		changes: sort(changes, (a, b) => (a.name < b.name) ? -1 : 1),
		missing: sort(missing),
		errors,
		warnings,
		ok: check_rc == 0 && !length(errors),
	};
}

function check_result(ctx) {
	let rc = read_trim(ctx, `${STATE}/check.rc`);

	return summarize(load_json(ctx, `${STATE}/dump.json`), read(ctx, `${STATE}/check.txt`),
		(rc != null && match(rc, /^[0-9]+$/)) ? +rc : null);
}

function status(ctx) {
	ctx = context(ctx);

	let image = null;
	let ok = read_trim(ctx, `${STATE}/download.ok`);

	if (ok != null) {
		let st = stat(`${ctx.root}${STATE}/firmware.bin`);

		if (st)
			image = { version: ok, size: st.size };
	}

	return { job: job_status(ctx, 'asu'), check: check_result(ctx), image };
}

// Start a step: "check" (optionally for a version), "download" (the version
// the last check was for, only when it found no errors) or "install" (the
// downloaded image). Returns the job status or a ubus status code.
function run(ctx, action, version) {
	ctx = context(ctx);

	switch (action) {
	case 'check':
		if (version != null && version != '' && !match(version, VERSION_RE))
			return 2;

		return start(ctx, 'asu', [ HELPER, 'check', ...((version ?? '') != '' ? [ version ] : []) ]);

	case 'download':
		let c = check_result(ctx);

		if (type(version) != 'string' || !match(version, VERSION_RE) || !c?.ok || c.to?.version != version)
			return 2;

		return start(ctx, 'asu', [ HELPER, 'download', version ]);

	case 'install':
		if (status(ctx).image == null)
			return 2;

		return start(ctx, 'asu', [ HELPER, 'install' ]);
	}

	return 2;
}

export { summarize, status, run };
