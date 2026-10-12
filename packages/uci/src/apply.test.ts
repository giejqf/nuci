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
		expect(probes).toBe(3);
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

	it('clamps the timeout', () => {
		expect(clampTimeout(5)).toBe(30);
		expect(clampTimeout(10_000)).toBe(600);
		expect(clampTimeout(undefined)).toBe(90);
	});
});
