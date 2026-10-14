// SPDX-License-Identifier: Apache-2.0
// Put a uci config back the way a spec found it (setup/cleanup outside the UI).

import type { createRpc } from '../../packages/rpc/src/index.ts';

type Rpc = ReturnType<typeof createRpc>;
type Values = Awaited<ReturnType<Rpc['uci']['getAll']>>;

const options = (s: Values[string]) =>
	Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith('.'))) as Record<
		string,
		string | string[]
	>;

/** Stage the changes that turn `config` back into `before` (no apply). */
export async function restoreConfig(rpc: Rpc, config: string, before: Values): Promise<void> {
	const now = await rpc.uci.getAll(config);
	for (const name of Object.keys(now)) if (!before[name]) await rpc.uci.delete(config, name);
	for (const [name, s] of Object.entries(before)) {
		const want = options(s);
		if (!now[name]) {
			await rpc.uci.add(config, s['.type'] as string, want, name);
			continue;
		}
		const extra = Object.keys(options(now[name]!)).filter((o) => !(o in want));
		if (extra.length) await rpc.uci.delete(config, name, extra);
		if (Object.keys(want).length) await rpc.uci.set(config, name, want);
	}
}
