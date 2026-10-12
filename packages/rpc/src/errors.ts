// SPDX-License-Identifier: Apache-2.0
//
// ubus status codes (libubus enum ubus_msg_status) and uhttpd JSON-RPC error
// codes, each mapped to an i18n key so every failure has a user-visible message.

export const UbusStatus = {
	OK: 0,
	INVALID_COMMAND: 1,
	INVALID_ARGUMENT: 2,
	METHOD_NOT_FOUND: 3,
	NOT_FOUND: 4,
	NO_DATA: 5,
	PERMISSION_DENIED: 6,
	TIMEOUT: 7,
	NOT_SUPPORTED: 8,
	UNKNOWN_ERROR: 9,
	CONNECTION_FAILED: 10,
} as const;
export type UbusStatusCode = (typeof UbusStatus)[keyof typeof UbusStatus];

/** Errors uhttpd-mod-ubus reports in the JSON-RPC `error` member. */
export const JsonRpcCode = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	OBJECT_NOT_FOUND: -32000,
	SESSION_NOT_FOUND: -32001,
	ACCESS_DENIED: -32002,
	TIMEOUT: -32003,
} as const;

export type RpcErrorKind = 'ubus' | 'jsonrpc' | 'http' | 'network' | 'session';

const UBUS_KEYS: Record<number, string> = {
	1: 'rpc.error.invalid_command',
	2: 'rpc.error.invalid_argument',
	3: 'rpc.error.method_not_found',
	4: 'rpc.error.not_found',
	5: 'rpc.error.no_data',
	6: 'rpc.error.permission_denied',
	7: 'rpc.error.timeout',
	8: 'rpc.error.not_supported',
	9: 'rpc.error.unknown',
	10: 'rpc.error.connection_failed',
};

const JSONRPC_KEYS: Record<number, string> = {
	[-32700]: 'rpc.error.protocol',
	[-32600]: 'rpc.error.protocol',
	[-32601]: 'rpc.error.method_not_found',
	[-32602]: 'rpc.error.invalid_argument',
	[-32603]: 'rpc.error.unknown',
	[-32000]: 'rpc.error.object_not_found',
	[-32001]: 'rpc.error.session_expired',
	[-32002]: 'rpc.error.permission_denied',
	[-32003]: 'rpc.error.timeout',
};

export class RpcError extends Error {
	readonly kind: RpcErrorKind;
	readonly code: number;
	readonly object: string;
	readonly method: string;

	constructor(kind: RpcErrorKind, code: number, object: string, method: string, detail?: string) {
		super(`${object}.${method}: ${detail ?? `${kind} error ${code}`}`);
		this.name = 'RpcError';
		this.kind = kind;
		this.code = code;
		this.object = object;
		this.method = method;
	}

	/** i18n key describing this error for users. */
	get messageKey(): string {
		switch (this.kind) {
			case 'ubus':
				return UBUS_KEYS[this.code] ?? 'rpc.error.unknown';
			case 'jsonrpc':
				return JSONRPC_KEYS[this.code] ?? 'rpc.error.unknown';
			case 'session':
				return 'rpc.error.session_expired';
			case 'network':
				return 'rpc.error.network';
			case 'http':
				return 'rpc.error.http';
		}
	}

	/** True for "you may not do this" (ACL) failures; pages render read-only. */
	get isPermissionDenied(): boolean {
		return (
			(this.kind === 'ubus' && this.code === UbusStatus.PERMISSION_DENIED) ||
			(this.kind === 'jsonrpc' && this.code === JsonRpcCode.ACCESS_DENIED)
		);
	}

	get isNotFound(): boolean {
		return (
			(this.kind === 'ubus' && this.code === UbusStatus.NOT_FOUND) ||
			(this.kind === 'jsonrpc' &&
				(this.code === JsonRpcCode.OBJECT_NOT_FOUND ||
					this.code === JsonRpcCode.METHOD_NOT_FOUND))
		);
	}
}

export function isRpcError(e: unknown): e is RpcError {
	return e instanceof RpcError;
}
