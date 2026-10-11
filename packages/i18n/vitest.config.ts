// SPDX-License-Identifier: Apache-2.0
import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: '@nuci/i18n',
		include: ['src/**/*.test.ts'],
	},
});
