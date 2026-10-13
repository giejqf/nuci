// SPDX-License-Identifier: Apache-2.0
import { nuciApp } from '@nuci/app-kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(nuciApp({ root: fileURLToPath(new URL('.', import.meta.url)) }));
