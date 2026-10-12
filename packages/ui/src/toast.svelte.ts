// SPDX-License-Identifier: Apache-2.0
//
// Global toast queue rendered by <Toaster>.

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
}

class Toasts {
	items = $state<Toast[]>([]);
	#next = 1;

	push(kind: ToastKind, message: string, timeoutMs = kind === 'error' ? 8000 : 4000): number {
		const id = this.#next++;
		this.items.push({ id, kind, message });
		if (timeoutMs > 0) setTimeout(() => this.dismiss(id), timeoutMs);
		return id;
	}

	dismiss(id: number): void {
		this.items = this.items.filter((t) => t.id !== id);
	}

	info = (m: string) => this.push('info', m);
	success = (m: string) => this.push('success', m);
	warning = (m: string) => this.push('warning', m);
	error = (m: string) => this.push('error', m);
}

export const toasts = new Toasts();
