// SPDX-License-Identifier: Apache-2.0
//
// Minimal test harness for host-side ucode tests (run via rpcd/test/run.sh).

'use strict';

let results = { passed: 0, failed: 0 };

function test(name, fn) {
	try {
		fn();
		results.passed++;
		print(`  ok   ${name}\n`);
	}
	catch (e) {
		results.failed++;
		print(`  FAIL ${name}\n       ${e.message}\n`);
	}
}

function fmt(v) {
	return sprintf('%J', v);
}

function eq(actual, expected, msg) {
	if (fmt(actual) != fmt(expected))
		die(`${msg ?? 'eq'}: expected ${fmt(expected)}, got ${fmt(actual)}`);
}

function ok(cond, msg) {
	if (!cond)
		die(msg ?? 'expected truthy value');
}

// Directory holding the tests and fixtures (set by run.sh).
function here() {
	return getenv('NUCI_TEST_DIR') ?? '.';
}

function done() {
	print(`  ${results.passed} passed, ${results.failed} failed\n`);
	exit(results.failed ? 1 : 0);
}

export { test, eq, ok, here, done };
