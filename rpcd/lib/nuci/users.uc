// SPDX-License-Identifier: Apache-2.0
//
// NuCI users (ADR-0006): an rpcd `login` section that authenticates against
// a system account ("$p$<name>") without a login shell (/bin/false is not in
// /etc/shells, so dropbear refuses it). Accounts and login sections are
// created and removed together, never staged; root is never touched.
// Passwords are hashed by busybox passwd from stdin: never on a command
// line, never stored or returned in clear.

'use strict';

import { readfile, writefile, rename, chmod, lsdir, popen } from 'fs';
import { STATUS } from 'nuci.rpc';
import { shell_quote } from 'nuci.util';

const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const GROUP_RE = /^([a-z0-9][a-z0-9_-]{0,63}|\*)$/;
const GECOS = 'NuCI user';
const UID_MIN = 1000, UID_MAX = 59999;

// busybox passwd asks twice; it runs as root, so no old password is needed.
function default_set_password(name, password) {
	let p = popen(`passwd ${shell_quote(name)} >/dev/null 2>&1`, 'w');
	if (!p) return false;
	p.write(`${password}\n${password}\n`);
	return p.close() == 0;
}

function ctx_of(ctx) {
	ctx ??= {};
	return {
		root: ctx.root ?? '',
		uci: ctx.uci,
		set_password: ctx.set_password ?? default_set_password,
	};
}

function valid_password(pw) {
	if (type(pw) != 'string' || length(pw) < 8 || length(pw) > 128)
		return false;
	// No control characters: passwd reads lines.
	for (let i = 0; i < length(pw); i++) {
		let c = ord(pw, i);
		if (c < 32 || c == 127) return false;
	}
	return true;
}

function valid_groups(list, known) {
	if (type(list) != 'array') return false;
	for (let g in list)
		if (type(g) != 'string' || !match(g, GROUP_RE) || (g != '*' && !(g in known)))
			return false;
	return true;
}

/** ACL groups installed under /usr/share/rpcd/acl.d (name -> description). */
function groups(ctx) {
	let c = ctx_of(ctx), found = {};
	for (let f in sort(lsdir(c.root + '/usr/share/rpcd/acl.d') ?? [])) {
		if (!match(f, /\.json$/)) continue;
		let d = json(readfile(`${c.root}/usr/share/rpcd/acl.d/${f}`) ?? 'null');
		if (type(d) != 'object') continue;
		for (let name, g in d)
			if (match(name, GROUP_RE))
				found[name] = type(g?.description) == 'string' ? g.description : '';
	}
	let out = {};
	for (let name in sort(keys(found))) out[name] = found[name];
	return out;
}

function passwd_lines(c, file) {
	return split(readfile(c.root + file) ?? '', '\n');
}

function account(c, name) {
	for (let l in passwd_lines(c, '/etc/passwd')) {
		let f = split(l, ':');
		if (f[0] == name) return { uid: +f[2], gecos: f[4], shell: f[6] };
	}
	return null;
}

function write_lines(c, file, lines, mode) {
	let path = c.root + file, tmp = path + '.nuci-tmp';
	let text = join('\n', filter(lines, (l, i) => length(l) || i < length(lines) - 1));
	if (!match(text, /\n$/)) text += '\n';
	if (writefile(tmp, text) == null) return false;
	chmod(tmp, mode);
	return rename(tmp, path);
}

function login_sections(c) {
	let out = [];
	c.uci.foreach('rpcd', 'login', (s) => push(out, s));
	return out;
}

function to_list(v) {
	return type(v) == 'array' ? v : (v != null ? [ v ] : []);
}

function list(ctx) {
	let c = ctx_of(ctx);
	return {
		users: map(login_sections(c), (s) => {
			let name = s.username, acc = account(c, name);
			return {
				username: name,
				read: to_list(s.read),
				write: to_list(s.write),
				builtin: name == 'root',
				managed: acc?.gecos == GECOS,
			};
		})
	};
}

function remove_account(c, name) {
	let keep = (l) => split(l, ':')[0] != name;
	write_lines(c, '/etc/passwd', filter(passwd_lines(c, '/etc/passwd'), keep), 0o644);
	write_lines(c, '/etc/shadow', filter(passwd_lines(c, '/etc/shadow'), keep), 0o600);
}

function create(ctx, args) {
	let c = ctx_of(ctx), name = args.username;
	if (type(name) != 'string' || !match(name, NAME_RE) || name == 'root')
		return STATUS.INVALID_ARGUMENT;
	if (!valid_password(args.password))
		return STATUS.INVALID_ARGUMENT;
	let known = groups(c), read = args.read ?? [], write = args.write ?? [];
	if (!valid_groups(read, known) || !valid_groups(write, known))
		return STATUS.INVALID_ARGUMENT;
	// Never adopt an existing account (daemon users, ...) or login.
	if (account(c, name) || length(filter(login_sections(c), (s) => s.username == name)))
		return STATUS.NOT_SUPPORTED;

	let pw = passwd_lines(c, '/etc/passwd'), sh = passwd_lines(c, '/etc/shadow');
	let uid = UID_MIN;
	for (let l in pw) {
		let u = +split(l, ':')[2];
		if (u >= uid && u <= UID_MAX) uid = u + 1;
	}
	if (uid > UID_MAX) return STATUS.UNKNOWN_ERROR;

	let pw_new = filter(pw, (l) => length(l));
	let sh_new = filter(sh, (l) => length(l));
	push(pw_new, `${name}:x:${uid}:65534:${GECOS}:/var:/bin/false`);
	push(sh_new, `${name}:*:${int(time() / 86400)}:0:99999:7:::`);
	if (!write_lines(c, '/etc/passwd', pw_new, 0o644) || !write_lines(c, '/etc/shadow', sh_new, 0o600))
		return STATUS.UNKNOWN_ERROR;

	if (!c.set_password(name, args.password)) {
		remove_account(c, name);
		return STATUS.UNKNOWN_ERROR;
	}

	let s = c.uci.add('rpcd', 'login');
	c.uci.set('rpcd', s, 'username', name);
	c.uci.set('rpcd', s, 'password', `$p$${name}`);
	if (length(read)) c.uci.set('rpcd', s, 'read', read);
	if (length(write)) c.uci.set('rpcd', s, 'write', write);
	c.uci.commit('rpcd');
	return { username: name };
}

function managed_login(c, name) {
	if (type(name) != 'string' || !match(name, NAME_RE) || name == 'root')
		return null;
	for (let s in login_sections(c))
		if (s.username == name) return s;
	return null;
}

function update(ctx, args) {
	let c = ctx_of(ctx), s = managed_login(c, args.username);
	if (!s) return args.username == 'root' ? STATUS.PERMISSION_DENIED : STATUS.NOT_FOUND;
	let known = groups(c), read = args.read ?? [], write = args.write ?? [];
	if (!valid_groups(read, known) || !valid_groups(write, known))
		return STATUS.INVALID_ARGUMENT;
	for (let opt in [ 'read', 'write' ]) c.uci.delete('rpcd', s['.name'], opt);
	if (length(read)) c.uci.set('rpcd', s['.name'], 'read', read);
	if (length(write)) c.uci.set('rpcd', s['.name'], 'write', write);
	c.uci.commit('rpcd');
	return { username: args.username };
}

function set_password(ctx, args) {
	let c = ctx_of(ctx);
	if (!managed_login(c, args.username) || account(c, args.username)?.gecos != GECOS)
		return args.username == 'root' ? STATUS.PERMISSION_DENIED : STATUS.NOT_FOUND;
	if (!valid_password(args.password))
		return STATUS.INVALID_ARGUMENT;
	return c.set_password(args.username, args.password) ? { username: args.username } : STATUS.UNKNOWN_ERROR;
}

function remove(ctx, args) {
	let c = ctx_of(ctx), s = managed_login(c, args.username);
	if (!s) return args.username == 'root' ? STATUS.PERMISSION_DENIED : STATUS.NOT_FOUND;
	c.uci.delete('rpcd', s['.name']);
	c.uci.commit('rpcd');
	// Only accounts NuCI created; a login pointing at another account keeps it.
	if (account(c, args.username)?.gecos == GECOS)
		remove_account(c, args.username);
	return { username: args.username };
}

export { NAME_RE, GECOS, groups, list, create, update, set_password, remove, valid_password };
