// SPDX-License-Identifier: Apache-2.0
//
// Save & apply every staged change with the rollback protocol (ADR-0002),
// announcing the outcome. Used by the ApplyBar and by flows that apply
// from their own button (e.g. the setup wizard).

import { t } from '@nuci/i18n';
import type { ApplyPhase } from '@nuci/uci';
import { hostStore, type NuciContext } from './context';
import { toasts } from './toast.svelte';

export async function applyStaged(ctx: NuciContext, rollback = true): Promise<ApplyPhase> {
	if (!ctx.apply) return 'failed';
	const uci = hostStore(ctx);
	const { prepare, done, ...base } = ctx.apply;
	const extra = (await prepare?.()) ?? {};
	const result = await uci.applyAll({ ...base, ...extra, rollback });
	done?.();
	if (result.phase === 'confirmed') toasts.success(t('ui.apply.confirmed'));
	else if (result.phase === 'rolled-back') toasts.warning(t('ui.apply.rolled_back'));
	else if (result.phase === 'failed')
		toasts.error(
			t('ui.apply.failed', {
				error: String((result.error as Error)?.message ?? result.error),
			}),
		);
	uci.resetApplyState();
	return result.phase;
}
