// SPDX-License-Identifier: Apache-2.0
// Which realtime transport this run expects (run.sh toggles the SSE handler).

export const TRANSPORT: 'sse' | 'poll' = process.env.NUCI_E2E_TRANSPORT === 'poll' ? 'poll' : 'sse';
