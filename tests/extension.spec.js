import {test, expect, chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
let server, origin;
const fixture = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Clear Pop Up · laboratoire local</title>
<style>body{font:16px system-ui;margin:40px;background:#f8faf8}button,a{padding:12px;margin:8px}h1{color:#175c4b}.overlay{position:fixed;inset:0;z-index:1000;background:#233c35dd;display:grid;place-items:center;color:white}.card{background:#fff;color:#123d33;padding:40px;border-radius:14px}#consentless{position:fixed;inset:20%;z-index:1001;background:#fff;padding:30px}</style></head><body><h1>Laboratoire Clear Pop Up</h1><p>Uniquement des scénarios locaux, sans service tiers.</p>
<button id="legit">Ouvrir une fenêtre légitime</button><a id="link" href="/target" target="_blank">Lien légitime</a><button id="dialog">Ouvrir un dialogue légitime</button><div id="content">Contenu de la page</div>
<script>
document.getElementById('legit').onclick=()=>window.open('/target','clear-popup-legit');
document.getElementById('dialog').onclick=()=>{const n=document.createElement('div');n.id='consentless';n.className='overlay';n.setAttribute('role','dialog');n.setAttribute('aria-modal','true');n.innerHTML='<div class="card">Dialogue demandé<button>Fermer</button></div>';document.body.append(n)};
</script></body></html>`;
test.beforeAll(async () => {
  server = createServer((req,res) => { res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); res.end(req.url === '/target' ? '<title>Fenêtre autorisée</title>Fenêtre légitime' : fixture); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = `http://localhost:${server.address().port}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function setup() {
  const profile = await mkdtemp(join(tmpdir(),'clear-popup-test-'));
  const context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1100,height:800},args:[`--disable-extensions-except=${resolve('src')}`,`--load-extension=${resolve('src')}`]});
  context.setDefaultTimeout(5000);
  const requests = [], errors = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && !['localhost','127.0.0.1'].includes(new URL(request.url()).hostname)) requests.push(request.url()); });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  await expect.poll(() => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts().then(s => s.length))).toBe(1);
  const page = await context.newPage(); await page.goto(origin);
  async function panel() { const panel = await context.newPage(); await page.bringToFront(); await panel.goto(`chrome-extension://${extensionId}/popup.html`); await expect(panel.locator('#host')).toHaveText(new URL(page.url()).hostname); return panel; }
  return {context,page,panel,worker,requests,errors,async close(){ await context.close(); await rm(profile,{recursive:true,force:true}); }};
}
async function overlay(page, id='test-overlay') {
  await page.evaluate(id => {document.body.style.overflow='hidden';const n=document.createElement('div');n.id=id;n.className='overlay';n.innerHTML='<div class="card"><h2>Promotion non sollicitée</h2><p>Le contenu reste sous cette couche.</p></div>';document.body.append(n);},id);
}

test('fenêtres automatiques, liens synthétiques et formulaires bloqués; compteur exact', async () => {
  const env = await setup();
  try {
    const result = await env.page.evaluate(() => window.open('/target','_blank') === null); expect(result).toBe(true);
    await env.page.evaluate(() => { const a=document.createElement('a');a.href='/target';a.target='_blank';document.body.append(a);a.click(); const form=document.createElement('form');form.action='/target';form.target='_blank';document.body.append(form);form.submit(); const base=document.createElement('base');base.target='_blank';document.head.append(base);const inherited=document.createElement('form');inherited.action='/target';document.body.append(inherited);inherited.submit(); });
    const panel = await env.panel(); await expect(panel.locator('#popups')).toHaveText('4');
    expect(env.context.pages().filter(p=>p.url().endsWith('/target'))).toHaveLength(0);
    expect(env.requests).toEqual([]); expect(env.errors).toEqual([]);
  } finally { await env.close(); }
});

test('clic utilisateur et lien target blank autorisés, sans faux comptage', async () => {
  const env = await setup();
  try {
    let opened = env.context.waitForEvent('page'); await env.page.locator('#legit').click(); let popup = await opened; await popup.waitForLoadState(); expect(popup.url()).toBe(`${origin}/target`); await popup.close();
    opened=env.context.waitForEvent('page'); await env.page.locator('#link').click(); popup=await opened; await popup.waitForLoadState(); expect(popup.url()).toBe(`${origin}/target`); await popup.close();
    const panel=await env.panel(); await expect(panel.locator('#popups')).toHaveText('0'); expect(env.errors).toEqual([]);
  } finally { await env.close(); }
});

test('overlay automatique masqué, défilement libéré, restauration sans nouveau masquage', async () => {
  const env = await setup();
  try {
    await overlay(env.page); await expect(env.page.locator('#test-overlay')).toBeHidden();
    expect(await env.page.evaluate(()=>getComputedStyle(document.body).overflowY)).toBe('auto');
    const panel=await env.panel(); await expect(panel.locator('#overlays')).toHaveText('1');
    await panel.locator('#undo').click(); await expect(env.page.locator('#test-overlay')).toBeVisible();
    expect(await env.page.evaluate(()=>getComputedStyle(document.body).overflowY)).toBe('hidden');
    await panel.locator('#scan').click(); await expect(env.page.locator('#test-overlay')).toBeVisible();
    await expect(panel.locator('#overlays')).toHaveText('1');
    await panel.locator('body').screenshot({path:process.env.CLEAR_POPUP_PROOF_PATH || test.info().outputPath('popup.png')});
    expect(env.requests).toEqual([]); expect(env.errors).toEqual([]);
  } finally { await env.close(); }
});

test('dialogue demandé et bandeau fixe préservés', async () => {
  const env=await setup();
  try {
    await env.page.locator('#dialog').click(); await expect(env.page.locator('#consentless')).toBeVisible();
    await env.page.evaluate(()=>{const n=document.createElement('nav');n.id='sticky';n.style='position:fixed;top:0;left:0;right:0;height:60px;z-index:2000;background:white';n.textContent='Menu du site';document.body.append(n)});
    const panel=await env.panel(); await expect(panel.locator('#overlays')).toHaveText('0'); await expect(env.page.locator('#sticky')).toBeVisible();
  } finally { await env.close(); }
});

test('exception sur hôte exact, configuration persistante sans URL ni historique', async () => {
  const env=await setup();
  try {
    const panel=await env.panel(); await panel.locator('#exception').check(); await expect(panel.locator('#status')).toContainText('Enregistré'); await panel.close();
    await env.page.reload();
    const opened=env.context.waitForEvent('page'); const accepted=await env.page.evaluate(()=>window.open('/target','_blank')!==null); expect(accepted).toBe(true); const popup=await opened; await popup.close();
    await overlay(env.page); await expect(env.page.locator('#test-overlay')).toBeVisible();
    const registrations=await env.worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts()); expect(registrations[0].excludeMatches).toEqual(['*://localhost/*']);
    // Different host on the same fixture server must not inherit the exception.
    await env.page.goto(origin.replace('localhost','127.0.0.1')); expect(await env.page.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
    const data=await env.worker.evaluate(()=>chrome.storage.local.get(null)); expect(Object.keys(data)).toEqual(['settings']); expect(data.settings.exceptions).toEqual(['localhost']); expect(JSON.stringify(data)).not.toContain('/target');
    expect(env.requests).toEqual([]);
  } finally { await env.close(); }
});

test('sélection manuelle mémorisée puis réappliquée, effacement local', async () => {
  const env=await setup();
  try {
    let panel=await env.panel(); await panel.locator('#remember').check(); await panel.locator('#pick').click();
    await env.page.locator('#content').click(); await expect(env.page.locator('#content')).toBeHidden();
    await expect.poll(()=>env.worker.evaluate(()=>chrome.storage.local.get('settings').then(x=>x.settings.rules.localhost))).toEqual(['#content']);
    await env.page.reload(); await expect(env.page.locator('#content')).toBeHidden();
    panel=await env.panel(); await panel.locator('summary').click(); await panel.locator('#erase').click(); await expect(panel.locator('#status')).toContainText('effacés');
    await env.page.reload(); await expect(env.page.locator('#content')).toBeVisible();
    const config=await env.worker.evaluate(()=>chrome.storage.local.get('settings')); expect(config.settings.rules).toEqual({}); expect(config.settings.exceptions).toEqual([]);
    expect(env.errors).toEqual([]);
  } finally { await env.close(); }
});

test('désactivation globale, basic et advanced indépendants, compteur remis à zéro', async () => {
  const env=await setup();
  try {
    let panel=await env.panel(); await panel.locator('#basic').uncheck(); await expect(panel.locator('#status')).toContainText('Enregistré'); await panel.close();
    await env.page.reload(); const opened=env.context.waitForEvent('page'); await env.page.evaluate(()=>window.open('/target','_blank')); const popup=await opened; await popup.close();
    await overlay(env.page); await expect(env.page.locator('#test-overlay')).toBeHidden();
    panel=await env.panel(); await panel.locator('#advanced').uncheck(); await expect(panel.locator('#status')).toContainText('Enregistré'); await expect(env.page.locator('#test-overlay')).toBeVisible();
    await panel.locator('#basic').check(); await expect(panel.locator('#status')).toContainText('Enregistré'); await panel.locator('#enabled').uncheck(); await expect(panel.locator('#status')).toContainText('Enregistré'); await panel.close();
    await env.page.reload(); panel=await env.panel(); await expect(panel.locator('#overlays')).toHaveText('0'); await expect(panel.locator('#popups')).toHaveText('0');
    expect(await env.worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).toEqual([]); expect(env.requests).toEqual([]);
  } finally { await env.close(); }
});

test('iframe et piège plein écran, blocage avant création de fenêtre', async () => {
  const env=await setup();
  try {
    await env.page.evaluate(origin=>{const frame=document.createElement('iframe');frame.src=origin;document.body.append(frame)},origin);
    await expect.poll(()=>env.page.frames().length).toBe(2);
    const frame=env.page.frames().find(frame=>frame.parentFrame()); await frame.waitForLoadState(); expect(await frame.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
    await frame.evaluate(()=>{const n=document.createElement('div');n.id='iframe-overlay';n.style='position:fixed;inset:0;z-index:1000;background:white';document.body.append(n)});
    await expect(frame.locator('#iframe-overlay')).toBeHidden();
    const panel=await env.panel(); await panel.locator('#undo').click(); await expect(frame.locator('#iframe-overlay')).toBeVisible();
    await panel.locator('#advanced').uncheck(); await expect(panel.locator('#status')).toContainText('Enregistré'); await panel.close();
    await env.page.evaluate(()=>{const n=document.createElement('div');n.id='trap';n.style='position:fixed;inset:0;z-index:5000';n.onclick=()=>window.open('/target','_blank');document.body.append(n)});
    await env.page.locator('#trap').click(); const state=await env.panel(); await expect(state.locator('#popups')).toHaveText('2');
    expect(env.context.pages().filter(page=>page.url().endsWith('/target'))).toHaveLength(0); expect(env.errors).toEqual([]);
  } finally { await env.close(); }
});
