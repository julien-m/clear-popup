#!/usr/bin/env node
// macOS chooses application UI language through Cocoa, independently of --lang.
// This launcher changes arguments for a disposable test process only, never preferences.
import {spawn} from 'node:child_process';
const binary = process.env.CLEAR_TEST_CHROMIUM_BINARY;
const locale = process.env.CLEAR_TEST_UI_LANGUAGE;
if (!binary || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale || '')) throw new Error('Missing Chromium binary or valid test UI language');
// Cocoa's language-array argument also counts as a headless startup target.
// Drop Playwright's redundant blank target; tests open their own loopback pages.
const child = spawn(binary, ['-AppleLanguages', `(${locale})`, ...process.argv.slice(2).filter(arg => arg !== 'about:blank')], {stdio: ['inherit', 'inherit', 'inherit', 3, 4]});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', error => {console.error(error.message); process.exitCode = 1;});
child.on('exit', code => process.exit(code ?? 1));
