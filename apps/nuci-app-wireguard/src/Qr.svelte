<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- QR code of a text, drawn as one SVG path (dark modules on a light quiet zone). -->
<script lang="ts">
	import { encode } from 'uqr';

	let { text, label }: { text: string; label: string } = $props();

	const qr = $derived(encode(text, { ecc: 'M', border: 2 }));
	const path = $derived(
		qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join(''),
	);
</script>

<svg
	viewBox="0 0 {qr.size} {qr.size}"
	class="h-64 w-64 rounded bg-white p-1"
	shape-rendering="crispEdges"
	role="img"
	aria-label={label}
	data-testid="wg-qr"
>
	<path d={path} fill="#000" />
</svg>
