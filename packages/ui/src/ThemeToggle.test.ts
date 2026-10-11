// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle.svelte';
import { theme, THEME_STORAGE_KEY } from './theme.svelte';

describe('ThemeToggle', () => {
	beforeEach(() => {
		localStorage.clear();
		theme.set('system');
	});

	it('cycles light → dark → system and persists overrides', async () => {
		render(ThemeToggle);
		const btn = screen.getByRole('button');
		expect(btn.dataset.themePreference).toBe('system');

		await fireEvent.click(btn);
		expect(btn.dataset.themePreference).toBe('light');
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
		expect(document.documentElement.dataset.theme).toBe('light');

		await fireEvent.click(btn);
		expect(btn.dataset.themePreference).toBe('dark');
		expect(document.documentElement.dataset.theme).toBe('dark');

		await fireEvent.click(btn);
		expect(btn.dataset.themePreference).toBe('system');
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
	});
});
