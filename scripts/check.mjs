import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {normalize,hostname} from '../src/core.js';
import {validateExtension} from './validate-i18n.mjs';
const locales = await validateExtension(new URL('../src/', import.meta.url).pathname);
const registry = JSON.parse(await readFile(new URL('../ui/locales.json', import.meta.url)));
assert.deepEqual([...locales.locales].sort(), [...registry.locales].sort());
const english = JSON.parse(await readFile(new URL('../src/_locales/en/messages.json', import.meta.url)));
for (const locale of registry.locales) {
  const catalog = JSON.parse(await readFile(new URL(`../src/_locales/${locale}/messages.json`, import.meta.url)));
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(english).sort(), `${locale}: incomplete catalog`);
}
for (const name of ['popup.html', 'popup.js', 'content.js']) {
  const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
  const keys = [...source.matchAll(/data-i18n(?:-(?:title|placeholder|aria-label|alt))?=["']([A-Za-z0-9_]+)["']/g)].map(m => m[1]);
  for (const call of source.matchAll(/\bt\(\s*([^,\n]+)/g)) {
    const direct = call[1].match(/^["']([A-Za-z0-9_]+)["']/);
    if (direct) keys.push(direct[1]);
    else for (const branch of call[1].matchAll(/[?:]\s*["']([A-Za-z0-9_]+)["']/g)) keys.push(branch[1]);
  }
  for (const key of keys) assert(Object.hasOwn(english, key), `${name}: missing message ${key}`);
}
const root = new URL('../src/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['storage','scripting','activeTab']);
assert(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
const css = await readFile(new URL('popup.css', root), 'utf8');
assert(!/@import\s|url\(\s*["']?https?:/i.test(css), 'Styles must be bundled without remote requests');
assert.deepEqual(manifest.content_scripts[0].js, ['i18n.js', 'injected-theme.js', 'content.js']);
for (const name of await readdir(root)) if (name.endsWith('.js')) {
  const path = new URL(name,root); execFileSync(process.execPath,['--check',path.pathname],{timeout:2000});
  const source = await readFile(path,'utf8');
  assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval)\s*\(/.test(source),`${name}: Network or dynamic execution API is forbidden`);
  assert(!/https?:\/\/[a-z0-9]/i.test(source),`${name}: unexpected remote address`);
}
assert.equal(hostname('https://example.com/path?secret=1'),'example.com');
assert.equal(hostname('chrome://extensions'),'');
const sanitized = normalize({enabled:'false',exceptions:['example.com','*.example.com','example.com.evil','EXAMPLE.com','bad/host'],rules:{'example.com':['#overlay',null]}});
assert.equal(sanitized.enabled,true); assert.deepEqual(sanitized.exceptions,['example.com','example.com.evil']); assert.deepEqual(sanitized.rules['example.com'],['#overlay']);
console.log('MV3 manifest, syntax, minimal permissions, no network APIs and normalization: OK');

console.log(`Native i18n catalogs validated: ${locales.locales.join(', ')} (${locales.keys} keys each).`);
