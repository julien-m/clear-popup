// SPDX-License-Identifier: MIT
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateCatalog(catalog, base = catalog) {
  if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object') throw new Error('Invalid catalog');
  for (const [key, entry] of Object.entries(catalog)) {
    if (!/^[A-Za-z0-9_]+$/.test(key) || !Object.hasOwn(base, key)) throw new Error(`Unknown key: ${key}`);
    if (!entry || typeof entry.message !== 'string' || !entry.message.trim()) throw new Error(`Empty message: ${key}`);
    const named = s => [...s.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g)].map(m => m[1].toLowerCase()).sort();
    const names = named(entry.message);
    if (JSON.stringify(names) !== JSON.stringify(named(base[key].message))) throw new Error(`Placeholder mismatch: ${key}`);
    for (const name of new Set(names)) {
      const definitions = Object.entries(entry.placeholders ?? {});
      const definition = definitions.find(([k]) => k.toLowerCase() === name)?.[1];
      const original = Object.entries(base[key].placeholders ?? {}).find(([k]) => k.toLowerCase() === name)?.[1];
      if (!definition || !/^\$[1-9]$/.test(definition.content) || definition.content !== original?.content) throw new Error(`Invalid placeholder: ${key}.${name}`);
    }
    // Named placeholders make substitution contracts reviewable across languages.
    if (/(?<!\$)\$[1-9]/.test(entry.message)) throw new Error(`Use named placeholders: ${key}`);
  }
}

export async function validateExtension(root) {
  const read = async p => JSON.parse(await readFile(resolve(root, p), 'utf8'));
  const manifest = await read('manifest.json');
  if (!manifest.default_locale) throw new Error('Missing default_locale');
  const locales = (await readdir(resolve(root, '_locales'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
  if (!locales.includes(manifest.default_locale)) throw new Error('Default catalog missing');
  const base = await read(`_locales/${manifest.default_locale}/messages.json`);
  if (Object.keys(base).length === 0) throw new Error('Default catalog is empty');
  validateCatalog(base);
  for (const locale of locales) validateCatalog(await read(`_locales/${locale}/messages.json`), base);
  for (const match of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    if (!Object.hasOwn(base, match[1])) throw new Error(`Missing manifest message: ${match[1]}`);
  }
  return { locales, keys: Object.keys(base).length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await validateExtension(resolve(process.argv[2] ?? '.')));
}
