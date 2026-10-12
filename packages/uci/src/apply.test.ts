// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it } from 'vitest';
import { applyChanges, clampTimeout, type ApplyPhase } from './apply';
import { UciModel } from './model';
import { FakeRpcdUci, fixtureConfigs } from './test/fake-rpcd';

/** Virtual clock: sleep() advances time instantly. */
function clock() {
	let t = 1_000_000;
	return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

let rpcd: FakeRpcdUci;
let model: UciModel;

beforeEach(async () => {
	rpcd = new FakeRpcdUci(fixtureConfigs());
	model = new UciModel(rpcd);
	await model.load('system', 'network');
});

describe('applyChanges', () => {
	it('saves, applies with rollback, probes and confirms', async () => {
		const phases: ApplyPhase[] = [];
		model.set('system', '@system[0]', 'hostname', 'router');
		let probes = 0;
		const state = await applyChanges(model, {
			...clock(),
			probe: async () => ++probes >= 3,
			onState: (s) => phases.push(s.phase),
		});
		expect(state.phase).toBe('confirmed');
		expect(rpcd.log).toContainEqual(['apply', true, 90]);
		expect(rpcd.log).toContainEqual(['confirm']);
		expect(rpcd.log.findIndex((l) => l[0] === 'set')).toBeLessThan(
			rpcd.log.findIndex((l) => l[0] === 'apply'),
		);
		expect(rpcd.committed.system?.cfg01e48a?.hostname).toBe('router');
		expect(probes).toBe(5); // 2 failures, then 2 s of sustained success (non-network change)
		expect([...new Set(phases)]).toEqual(['saving', 'applying', 'confirming', 'confirmed']);
		expect(model.pendingCount).toBe(0);
	});

	it('never commits before apply (rollback must have something to restore)', async () => {
		model.set('network', 'lan', 'ipaddr', ['192.168.2.1/24']);
		await applyChanges(model, { ...clock(), probe: async () => true });
		expect(rpcd.log.some((l) => l[0] === 'commit')).toBe(false);
	});

	it('reports rolled-back when the router never answers before the deadline', async () => {
		const c = clock();
		model.set('network', 'lan', 'ipaddr', ['10.9.9.1/24']);
		let deadline = 0;
		const remaining: number[] = [];
		const state = await applyChanges(model, {
			...c,
			timeout: 30,
			probe: async () => {
				// unreachable until the router restored the old address
				if (!deadline) deadline = c.now() + 25_000;
				if (c.now() >= deadline + 5_000) {
					rpcd.fireRollback();
					return true;
				}
				return false;
			},
			onState: (s) => s.remaining !== undefined && remaining.push(s.remaining),
		});
		expect(state.phase).toBe('rolled-back');
		expect(rpcd.log).not.toContainEqual(['confirm']);
		expect(remaining[0]).toBe(30);
		expect(remaining.at(-1)).toBe(0);
		expect(model.get('network', 'lan', 'ipaddr')).toEqual(['192.168.1.1/24']);
	});

	it('treats NO_DATA from confirm as an earlier rollback', async () => {
		model.set('system', '@system[0]', 'hostname', 'x');
		const state = await applyChanges(model, {
			...clock(),
			probe: async () => {
				rpcd.fireRollback();
				return true;
			},
		});
		expect(state.phase).toBe('rolled-back');
	});

	it('withholds confirm while shouldConfirm is false', async () => {
		model.set('system', '@system[0]', 'hostname', 'x');
		let allow = false;
		let n = 0;
		const state = await applyChanges(model, {
			...clock(),
			probe: async () => (++n === 5 ? ((allow = true), true) : true),
			shouldConfirm: () => allow,
		});
		expect(state.phase).toBe('confirmed');
		expect(rpcd.log.filter((l) => l[0] === 'confirm')).toHaveLength(1);
	});

	it('applies unchecked without a rollback timer', async () => {
		model.set('system', '@system[0]', 'hostname', 'x');
		const state = await applyChanges(model, {
			...clock(),
			rollback: false,
			probe: async () => false,
		});
		expect(state.phase).toBe('confirmed');
		expect(rpcd.log).toContainEqual(['apply', false, undefined]);
		expect(rpcd.log).not.toContainEqual(['confirm']);
	});

	it('does nothing when there is nothing to apply', async () => {
		const state = await applyChanges(model, { ...clock(), probe: async () => true });
		expect(state.phase).toBe('confirmed');
		expect(rpcd.log.some((l) => l[0] === 'apply')).toBe(false);
	});

	it('fails when another apply is pending', async () => {
		model.set('system', '@system[0]', 'hostname', 'x');
		await model.save();
		await rpcd.apply(true, 90);
		model.set('system', '@system[0]', 'hostname', 'y');
		const state = await applyChanges(model, { ...clock(), probe: async () => true });
		expect(state.phase).toBe('failed');
	});

	it('does not confirm a network change on a success that precedes the reload', async () => {
		const c = clock();
		model.set('network', 'lan', 'ipaddr', ['10.9.9.1/24']);
		let applyAt = 0;
		// Reachable for 3 s after the hold-off, then the reload cuts us off
		// until the router rolls back at the deadline.
		const state = await applyChanges(model, {
			...c,
			timeout: 30,
			holdoffMs: 2000,
			probe: async () => {
				applyAt ||= c.now();
				const dt = c.now() - applyAt;
				if (dt < 3000) return true;
				if (c.now() >= applyAt + 28_000) {
					rpcd.fireRollback();
					return true;
				}
				return false;
			},
		});
		expect(state.phase).toBe('rolled-back');
		expect(rpcd.log).not.toContainEqual(['confirm']);
	});

	it('uses a 10 s settle window for network configs and honours settleMs', async () => {
		const c = clock();
		model.set('network', 'lan', 'proto', 'dhcp');
		const start = c.now();
		let confirmedAt = 0;
		const orig = rpcd.confirm.bind(rpcd);
		rpcd.confirm = async () => ((confirmedAt = c.now()), orig());
		expect(
			(await applyChanges(model, { ...c, holdoffMs: 0, probe: async () => true })).phase,
		).toBe('confirmed');
		expect(confirmedAt - start).toBeGreaterThanOrEqual(10_000);

		model.set('system', '@system[0]', 'hostname', 'quick');
		const s2 = c.now();
		await applyChanges(model, { ...c, holdoffMs: 0, settleMs: 0, probe: async () => true });
		expect(confirmedAt - s2).toBeLessThan(1000);
	});

	it('clamps the timeout', () => {
		expect(clampTimeout(5)).toBe(30);
		expect(clampTimeout(10_000)).toBe(600);
		expect(clampTimeout(undefined)).toBe(90);
	});
});
