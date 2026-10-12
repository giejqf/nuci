// SPDX-License-Identifier: Apache-2.0

export interface SelectOption {
	value: string;
	label: string;
}

export interface LogLine {
	key: string | number;
	time: string;
	/** syslog level: 0 emerg .. 7 debug */
	level: number;
	source?: string;
	msg: string;
}
