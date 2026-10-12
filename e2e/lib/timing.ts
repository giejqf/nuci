// SPDX-License-Identifier: Apache-2.0
// Timeouts scale on slow labs (a full-emulation guest on CI runners without
// KVM): NUCI_E2E_TIMEOUT_SCALE=3 triples every wait. Default 1.

const SCALE = Math.max(1, Number(process.env.NUCI_E2E_TIMEOUT_SCALE) || 1);

export function slow(ms: number): number {
	return Math.round(ms * SCALE);
}
