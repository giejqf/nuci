// SPDX-License-Identifier: Apache-2.0
//
// Throwaway nuci-app used only by e2e tests to prove the extension path
// (AGENTS.md §9 Phase 1). Plain DOM, no framework.

import { registerPage, type BoardInfoLike } from './types';

registerPage('hello', {
	path: 'services/hello',
	title: 'Hello',
	async mount(target, host) {
		host.addMessages('en', { 'hello.greeting': 'Hello from {name}' });
		const p = document.createElement('p');
		p.dataset.testid = 'hello-greeting';
		const board = await host.call<BoardInfoLike>('system', 'board');
		p.textContent = host.t('hello.greeting', { name: board.hostname });
		const sdk = document.createElement('p');
		sdk.dataset.testid = 'hello-sdk';
		sdk.textContent = `sdk ${host.sdkVersion}`;
		target.append(p, sdk);
		return () => target.replaceChildren();
	},
});
