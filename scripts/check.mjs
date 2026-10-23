import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {normalize,hostname} from '../src/core.js';
const root = new URL('../src/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['storage','scripting','activeTab']);
assert(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
const css = await readFile(new URL('popup.css', root), 'utf8');
assert(!/@import\s|url\(\s*["']?https?:/i.test(css), 'Styles must be bundled without remote requests');
assert.deepEqual(manifest.content_scripts[0].js, ['injected-theme.js', 'content.js']);
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
