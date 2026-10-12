// SPDX-License-Identifier: Apache-2.0
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'**/dist/',
			'**/node_modules/',
			'tools/qemu/',
			'tools/sdk/',
			'tools/imagebuilder/cache/',
			'tools/imagebuilder/work/',
			'e2e/test-results/',
			'e2e/playwright-report/',
		],
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			// `any` needs an explanatory comment (AGENTS.md §5); use eslint-disable-next-line with a reason.
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
		},
	},
	{
		files: ['**/*.svelte'],
		rules: {
			// Assigning a $bindable prop updates the parent; core ESLint cannot see that.
			'no-useless-assignment': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte'],
			},
		},
	},
);
