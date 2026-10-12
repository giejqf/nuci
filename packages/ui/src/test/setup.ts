// SPDX-License-Identifier: Apache-2.0
// jsdom has no ResizeObserver (Svelte's bind:clientWidth uses it).
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
