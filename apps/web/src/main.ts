// SPDX-License-Identifier: Apache-2.0
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { appHost } from './apps/host.svelte';

// Apps may import their entry before the shell renders; the registry must exist first.
appHost.install();

const target = document.getElementById('app');
if (!target) throw new Error('#app missing');

export default mount(App, { target });
