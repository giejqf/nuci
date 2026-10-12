// SPDX-License-Identifier: Apache-2.0
//
// Hash router (D6): #/group/page[/param]. Works under uhttpd without rewrites.

export interface Match<R> {
	route: R;
	params: Record<string, string>;
}

export function parseHash(hash: string): string {
	return hash.replace(/^#\/?/, '').split('?')[0]!.replace(/\/+$/, '');
}

/** Match "network/interfaces/:name" style patterns. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
	const p = pattern.split('/');
	const s = path.split('/');
	if (p.length !== s.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < p.length; i++) {
		const seg = p[i]!;
		if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(s[i]!);
		else if (seg !== s[i]) return null;
	}
	return params;
}

class Router {
	path = $state(typeof location === 'undefined' ? '' : parseHash(location.hash));

	constructor() {
		if (typeof window !== 'undefined')
			window.addEventListener('hashchange', () => (this.path = parseHash(location.hash)));
	}

	navigate(path: string, replace = false): void {
		const hash = `#/${path.replace(/^\/+/, '')}`;
		if (replace) history.replaceState(history.state, '', hash);
		else location.hash = hash;
		this.path = parseHash(hash);
	}

	match<R extends { path: string }>(routes: readonly R[]): Match<R> | null {
		for (const route of routes) {
			const params = matchPath(route.path, this.path);
			if (params) return { route, params };
		}
		return null;
	}
}

export const router = new Router();
