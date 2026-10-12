// SPDX-License-Identifier: Apache-2.0
//
// Login state. The session token lives in sessionStorage (D11); on reload
// we validate it with session.access before showing the shell.

import { Acl, type BoardInfo } from '@nuci/rpc';
import { rpc } from './services';

class Session {
	ready = $state(false);
	authenticated = $state(false);
	username = $state('');
	acl = $state(new Acl());
	board = $state<BoardInfo | null>(null);
	/** Set while the session expired and the user must log in again. */
	expired = $state(false);
	#reloginWaiters: ((ok: boolean) => void)[] = [];

	async init(): Promise<void> {
		rpc.system
			.board()
			.then((b) => (this.board = b))
			.catch(() => {});
		if (rpc.client.authenticated) {
			try {
				this.acl = await rpc.session.access();
				this.authenticated = true;
				this.username = sessionStorage.getItem('nuci.user') ?? 'root';
			} catch {
				rpc.client.setSession(null);
			}
		}
		// Only now: a stored session that died with a reboot must lead to the
		// login form, not to a re-login prompt the shell cannot show yet.
		rpc.client.onSessionExpired = () => this.#promptRelogin();
		this.ready = true;
	}

	async login(username: string, password: string): Promise<void> {
		const res = await rpc.session.login(username, password);
		this.acl = new Acl(res.acls);
		this.username = res.data?.username ?? username;
		try {
			sessionStorage.setItem('nuci.user', this.username);
		} catch {
			// ignore
		}
		this.authenticated = true;
		this.expired = false;
		for (const w of this.#reloginWaiters.splice(0)) w(true);
	}

	async logout(): Promise<void> {
		rpc.events.stop();
		await rpc.session.logout().catch(() => {});
		location.reload();
	}

	/** Re-login prompt for an expired session; resolves once the user logged in or gave up. */
	#promptRelogin(): Promise<boolean> {
		this.expired = true;
		return new Promise((resolve) => this.#reloginWaiters.push(resolve));
	}

	cancelRelogin(): void {
		for (const w of this.#reloginWaiters.splice(0)) w(false);
		void this.logout();
	}

	canRead(group: string): boolean {
		return this.acl.hasGroup(group, 'read');
	}

	canWriteUci(config: string): boolean {
		return this.acl.canUci(config, 'write');
	}
}

export const session = new Session();
