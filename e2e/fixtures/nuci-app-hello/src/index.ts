// SPDX-License-Identifier: Apache-2.0
//
// Throwaway nuci-app used only by e2e tests to prove the extension path:
// Svelte + @nuci/ui through @nuci/app-kit, with a uci-bound field that is
// staged in the host and applied with rollback (ADR-0004).

import { registerSveltePage } from '@nuci/app-kit';
import css from './app.css?inline';
import Hello from './Hello.svelte';
import en from './en.json';

registerSveltePage({
	id: 'hello',
	path: 'services/hello',
	title: 'Hello',
	component: Hello,
	css,
	messages: { en },
});
