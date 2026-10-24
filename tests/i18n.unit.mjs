// SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { validateCatalog } from '../scripts/validate-i18n.mjs';
const source = await readFile(new URL('../src/i18n.js', import.meta.url), 'utf8');

test('every declared locale ships a complete catalog with the same substitution contract', { timeout: 2000 }, async () => {
  const read = async locale => JSON.parse(await readFile(new URL(`../src/_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
  const { locales, defaultLocale } = JSON.parse(await readFile(new URL('../ui/locales.json', import.meta.url), 'utf8'));
  assert.equal(new Set(locales).size, locales.length);
  assert.ok(locales.includes(defaultLocale));
  const base = await read(defaultLocale);
  validateCatalog(base);
  for (const locale of locales) {
    const catalog = await read(locale);
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(base).sort());
    validateCatalog(catalog, base);
  }
});

test('native API receives substitutions; missing keys are visible; both namespaces work', { timeout: 2000 }, () => {
  for (const namespace of ['browser', 'chrome']) {
    const calls = [];
    const context = { console: { warn() {} }, [namespace]: { i18n: {
      getMessage(key, values) { calls.push([key, values]); return key === 'count' ? values[0] : ''; },
      getUILanguage() { return 'fr-FR'; },
    } } };
    runInNewContext(source, context);
    assert.equal(context.ExtensionI18n.message('count', ['27']), '27');
    assert.equal(context.ExtensionI18n.message('missing'), 'missing');
    assert.deepEqual(calls[0], ['count', ['27']]);
  }
});
test('DOM messages are text; attributes are restricted; host locale is explicit', { timeout: 2000 }, () => {
  const attributes = new Map([['data-i18n', 'label'], ['data-i18n-title', 'help'], ['data-i18n-href', 'bad']]);
  const node = { children: [], getAttribute: k => attributes.get(k), setAttribute: (k, v) => attributes.set(k, v) };
  const context = { chrome: { i18n: { getMessage: k => k === '@@bidi_dir' ? 'rtl' : '<img onerror=bad>', getUILanguage: () => 'ar' } } };
  runInNewContext(source, context);
  context.ExtensionI18n.render({ querySelectorAll: () => [node] });
  assert.equal(node.textContent, '<img onerror=bad>');
  assert.equal(attributes.get('title'), '<img onerror=bad>');
  assert.equal(attributes.has('href'), false);
  assert.equal(attributes.has('lang'), false);
  context.ExtensionI18n.setLocale(node);
  assert.equal(attributes.get('dir'), 'rtl');
  node.children = [{}];
  assert.throws(() => context.ExtensionI18n.render({ querySelectorAll: () => [node] }), /leaf/);
});
test('catalogs reject unknown keys and changed substitution positions; partial translation is allowed', { timeout: 2000 }, () => {
  const base = { count: { message: '$COUNT$ items', placeholders: { count: { content: '$1' } } } };
  validateCatalog({}, base);
  validateCatalog(base);
  assert.throws(() => validateCatalog({ other: { message: 'Other' } }, base), /Unknown/);
  assert.throws(() => validateCatalog({ count: { message: '$COUNT$ éléments', placeholders: { count: { content: '$2' } } } }, base), /placeholder/);
  assert.throws(() => validateCatalog({ count: { message: 'Items' } }, base), /mismatch/);
});
