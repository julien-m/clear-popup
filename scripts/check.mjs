import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {normalize,hostname} from '../src/core.js';
const root = new URL('../src/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['storage','scripting','activeTab']);
for (const name of await readdir(root)) if (name.endsWith('.js')) {
  const path = new URL(name,root); execFileSync(process.execPath,['--check',path.pathname],{timeout:2000});
  const source = await readFile(path,'utf8');
  assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval)\s*\(/.test(source),`${name}: API réseau/dynamique interdite`);
  assert(!/https?:\/\/[a-z0-9]/i.test(source),`${name}: adresse distante inattendue`);
}
assert.equal(hostname('https://example.com/path?secret=1'),'example.com');
assert.equal(hostname('chrome://extensions'),'');
const sanitized = normalize({enabled:'false',exceptions:['example.com','*.example.com','example.com.evil','EXAMPLE.com','bad/host'],rules:{'example.com':['#overlay',null]}});
assert.equal(sanitized.enabled,true); assert.deepEqual(sanitized.exceptions,['example.com','example.com.evil']); assert.deepEqual(sanitized.rules['example.com'],['#overlay']);
console.log('Manifest MV3, syntaxe, permissions minimales, absence API réseau et normalisation : OK');
