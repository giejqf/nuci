// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';

describe('App', () => {
	it('renders the shell with translated strings', () => {
		render(App);
		expect(screen.getByTestId('tagline').textContent).toBe(
			'A modern web interface for OpenWrt',
		);
	});
});
