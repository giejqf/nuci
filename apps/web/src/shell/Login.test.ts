// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login.svelte';

function ubusReply(body: unknown) {
	return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('Login', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('shows a friendly error for wrong credentials', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				ubusReply({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32002, message: 'Access denied' },
				}),
			),
		);
		render(Login);
		await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'nope' } });
		await fireEvent.submit(screen.getByTestId('login-form'));
		await waitFor(() =>
			expect(screen.getByTestId('login-error').textContent).toBe(
				'Wrong username or password.',
			),
		);
	});

	it('reports an unreachable router', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new TypeError('offline'))),
		);
		render(Login);
		await fireEvent.submit(screen.getByTestId('login-form'));
		await waitFor(() =>
			expect(screen.getByTestId('login-error').textContent).toBe(
				'The device cannot be reached.',
			),
		);
	});
});
