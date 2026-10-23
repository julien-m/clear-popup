import {cp, mkdir, readFile, readdir, rm, utimes, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url))).version;
const dist = `${root}dist`, unpacked = `${dist}/clear-popup`;
await rm(dist, {recursive:true, force:true}); await mkdir(dist, {recursive:true});
await cp(`${root}src`, unpacked, {recursive:true});
for (const name of ['license','privacy.md']) await cp(`${root}${name}`, `${unpacked}/${name}`);
await writeFile(`${unpacked}/readme.md`, '# Clear Pop Up\n\nExtract this archive, open chrome://extensions, enable Developer mode, choose Load unpacked and select this clear-popup folder containing manifest.json. Pin the extension and open its toolbar popup on an HTTP/HTTPS page.\n\nRead [the privacy policy](privacy.md), [MIT license](license) and [bundled dependency licenses](licenses/). For source code, development instructions and the shared theme, visit [the public repository](https://github.com/julien-m/clear-popup).\n');
const archive = `clear-popup-${version}.zip`;
const files = [];
async function walk(folder, relative) {
  for (const entry of (await readdir(folder, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const full = `${folder}/${entry.name}`, name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(full, name);
    else { await utimes(full, 946684800, 946684800); files.push(name); }
  }
}
await walk(unpacked, 'clear-popup');
execFileSync('zip', ['-X','-q',archive,...files], {cwd:dist,timeout:15000});
const hash = createHash('sha256').update(await readFile(`${dist}/${archive}`)).digest('hex');
await writeFile(`${dist}/sha256.txt`, `${hash}  ${archive}\n`);
console.log(`Package: ${unpacked}\nArchive: ${dist}/${archive}\nSHA256: ${hash}`);
