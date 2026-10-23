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
  server = createServer((req,res) => {
    if (req.url === '/hold-ready.js') {res.writeHead(200,{'content-type':'text/javascript'});setTimeout(()=>res.end(''),500);return;}
    const early = `<script>const early=document.createElement('div');early.id='early-overlay';early.className='overlay';early.textContent='Overlay pendant le chargement';document.body.append(early);window.earlyFrames=[];function sampleEarly(){window.earlyFrames.push({display:getComputedStyle(early).display,ready:document.readyState});if(window.earlyFrames.length<5)requestAnimationFrame(sampleEarly)}requestAnimationFrame(sampleEarly);</script><script src='/hold-ready.js'></script>`;
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(req.url === '/target' ? '<title>Fenêtre autorisée</title>Fenêtre légitime' : req.url === '/early-overlay' ? fixture.replace('</body>',early+'</body>') : fixture);
  });
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
  try {
    await expect.poll(() => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts().then(s => s.length))).toBe(2);
  } catch(error) {
    const state=await worker.evaluate(async()=>({settings:await chrome.storage.local.get(null),scripts:await chrome.scripting.getRegisteredContentScripts()}));
    await context.close();await rm(profile,{recursive:true,force:true});
    throw new Error(`${error.message}\nExtension startup state: ${JSON.stringify(state)}`);
  }
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
    const panel=await env.panel(); await panel.locator('#exception').check(); await expect(panel.locator('#status')).toContainText('Enregistré');
    await expect(panel.locator('#protection-state')).toHaveText('Autorisé sur ce site');
    await expect(panel.locator('.summary')).toHaveAttribute('data-protection','allowed');
    if(process.env.CLEAR_POPUP_ALLOWED_PROOF_PATH) await panel.locator('body').screenshot({path:process.env.CLEAR_POPUP_ALLOWED_PROOF_PATH});
    await panel.close();
    await env.page.reload();
    const opened=env.context.waitForEvent('page'); const accepted=await env.page.evaluate(()=>window.open('/target','_blank')!==null); expect(accepted).toBe(true); const popup=await opened; await popup.close();
    await overlay(env.page); await expect(env.page.locator('#test-overlay')).toBeVisible();
    const registrations=await env.worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts()); expect(registrations.find(script=>script.id==='clear-popup-main').excludeMatches).toEqual(['*://localhost/*']);
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

test('overlay masqué avant la première image et compteur incrémenté une seule fois', async () => {
  const env=await setup();
  try {
    const frames=await env.page.evaluate(()=>new Promise(resolve=>{
      requestAnimationFrame(()=>{
        const node=document.createElement('div');node.id='prepaint-overlay';node.className='overlay';node.textContent='Cette couche ne doit pas être affichée';document.body.append(node);
        const samples=[];
        function sample(){samples.push(getComputedStyle(node).display);if(samples.length<5)requestAnimationFrame(sample);else resolve(samples)}
        requestAnimationFrame(sample);
      });
    }));
    expect(frames.filter(display=>display!=='none'), 'Aucune image de rendu ne doit contenir l’overlay').toEqual([]);
    const panel=await env.panel();await expect(panel.locator('#overlays')).toHaveText('1');
    await panel.locator('#undo').click();await expect(env.page.locator('#prepaint-overlay')).toBeVisible();
    expect(env.errors).toEqual([]);
  } finally {await env.close()}
});


test('overlay détecté pendant le chargement, avant DOMContentLoaded', async () => {
  const env=await setup();
  try {
    await env.page.goto(`${origin}/early-overlay`);
    const frames=await env.page.evaluate(()=>window.earlyFrames);
    expect(frames).toHaveLength(5);
    expect(frames.every(frame=>frame.ready==='loading')).toBe(true);
    expect(frames.map(frame=>frame.display)).toEqual(Array(frames.length).fill('none'));
    const panel=await env.panel();await expect(panel.locator('#overlays')).toHaveText('1');
    expect(env.errors).toEqual([]);
  } finally {await env.close()}
});

// Accessibility observes the closed shadow tree without exposing it to page scripts.
async function noticeAX(page, action) {
  const cdp=await page.context().newCDPSession(page);
  try {
    const {nodes}=await cdp.send('Accessibility.getFullAXTree');
    const region=nodes.find(n=>n.role?.value==='region' && n.name?.value==='Pop-up bloqué par Clear Pop Up');
    const ids=new Set(region ? [region.nodeId] : []);
    for (let changed=true;changed;) {changed=false;for(const n of nodes) if(ids.has(n.nodeId)) for(const id of n.childIds||[]) if(!ids.has(id)){ids.add(id);changed=true;}}
    return await action(cdp,nodes.filter(n=>ids.has(n.nodeId)));
  } finally {await cdp.detach()}
}
async function noticeText(page) {return noticeAX(page,async (_,nodes)=>nodes.map(n=>n.name?.value||'').join(' '))}
async function clickNotice(page,name) {
  await expect.poll(()=>noticeText(page)).toContain(name);
  await noticeAX(page,async (cdp,nodes)=>{
    const button=nodes.find(n=>n.role?.value==='button' && n.name?.value===name);
    const {model}=await cdp.send('DOM.getBoxModel',{backendNodeId:button.backendDOMNodeId});
    const q=model.border;await page.mouse.click((q[0]+q[4])/2,(q[1]+q[5])/2);
  });
}

test('premier refus : notification unique, garder bloqué et réaffichage au rechargement', async () => {
  const env=await setup();
  try {
    await env.page.evaluate(()=>window.open('/target','_blank'));
    const notice=env.page.locator('[data-clear-popup-notice]');
    await expect(notice).toBeVisible();
    await notice.screenshot({path:process.env.CLEAR_POPUP_NOTICE_PROOF_PATH || test.info().outputPath('first-popup-notice.png')});
    await clickNotice(env.page,'Garder bloqué');await expect(notice).toHaveCount(0);
    await env.page.evaluate(()=>window.open('/target','_blank'));
    const panel=await env.panel();await expect(panel.locator('#popups')).toHaveText('2');
    await expect(notice).toHaveCount(0);expect((await env.worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.exceptions).toEqual([]);
    await panel.close();await env.page.reload();await env.page.evaluate(()=>window.open('/target','_blank'));await expect(notice).toBeVisible();
    expect(env.errors).toEqual([]);
  } finally {await env.close()}
});

test('autoriser exige un vrai clic, ajoute l’hôte exact et propose le rechargement sans rejouer la fenêtre', async () => {
  const env=await setup();
  try {
    await env.page.evaluate(()=>window.open('/target','_blank'));
    const notice=env.page.locator('[data-clear-popup-notice]');
    await expect(notice).toBeVisible();
    expect(await notice.evaluate(host=>host.shadowRoot)).toBe(null);
    await notice.evaluate(host=>host.click());
    expect((await env.worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.exceptions).toEqual([]);
    await clickNotice(env.page,'Autoriser ce site');await expect.poll(()=>noticeText(env.page)).toContain('Recharger la page');
    expect((await env.worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.exceptions).toEqual(['localhost']);
    expect(env.context.pages().filter(page=>page.url().endsWith('/target'))).toHaveLength(0);
    await Promise.all([env.page.waitForNavigation(),clickNotice(env.page,'Recharger la page')]);
    await expect(notice).toHaveCount(0);
    const opened=env.context.waitForEvent('page');expect(await env.page.evaluate(()=>window.open('/target','_blank')!==null)).toBe(true);await (await opened).close();
    expect(env.errors).toEqual([]);
  } finally {await env.close()}
});

test('refus dans une iframe : notification principale et exception limitée à l’origine de cette frame', async () => {
  const env=await setup();
  try {
    await env.page.evaluate(url=>{const frame=document.createElement('iframe');frame.src=url;document.body.append(frame)},origin.replace('localhost','127.0.0.1'));
    await expect.poll(()=>env.page.frames().length).toBe(2);const frame=env.page.frames().find(frame=>frame.parentFrame());await frame.waitForLoadState();
    expect(await frame.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
    const notice=env.page.locator('[data-clear-popup-notice]');await expect.poll(()=>noticeText(env.page)).toContain('127.0.0.1');
    await expect(frame.locator('[data-clear-popup-notice]')).toHaveCount(0);
    await clickNotice(env.page,'Autoriser ce site');await expect.poll(()=>noticeText(env.page)).toContain('127.0.0.1 est autorisé');
    expect((await env.worker.evaluate(()=>chrome.storage.local.get('settings'))).settings.exceptions).toEqual(['127.0.0.1']);
    expect(await env.page.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
    expect(env.errors).toEqual([]);
  } finally {await env.close()}
});


test('voile plein écran dont le contenu est masqué : retrait même après clic, interaction restaurée', async()=>{
 const env=await setup();
 try {
   await env.page.evaluate(()=>{
     const button=document.createElement('button');button.id='show-floating';button.textContent='Show a floating popup';
     const veil=document.createElement('div');veil.id='floating-backdrop';veil.className='overlay-demo';veil.hidden=true;
     veil.style='position:fixed;inset:0;z-index:60;background:#14243873;display:flex;align-items:center;justify-content:center';
     const card=document.createElement('div');card.style='display:none!important';card.textContent='Already hidden by a cosmetic filter';veil.append(card);
     document.head.insertAdjacentHTML('beforeend','<style>html{scrollbar-gutter:stable}body{min-height:200vh}[hidden]{display:none!important}</style>');
     button.onclick=()=>{document.body.style.overflow='hidden';veil.hidden=false};document.body.append(button,veil);
   });
   await env.page.locator('#show-floating').click();
   await expect(env.page.locator('#floating-backdrop')).toBeHidden();
   expect(await env.page.evaluate(()=>getComputedStyle(document.body).overflowY)).toBe('auto');
   await env.page.locator('#dialog').click();await expect(env.page.locator('#consentless')).toBeVisible();
   const panel=await env.panel();await expect(panel.locator('#overlays')).toHaveText('1');
 } finally {await env.close()}
});


test('dialogue visible sous un parent visibility hidden préservé après clic',async()=>{
 const env=await setup();
 try {
  await env.page.evaluate(()=>{
   const b=document.createElement('button');b.id='requested-dialog';b.textContent='Open';b.onclick=()=>{
    const veil=document.createElement('div');veil.id='requested-overlay';veil.style='position:fixed;inset:0;z-index:60';
    const wrapper=document.createElement('div');wrapper.style.visibility='hidden';
    const dialog=document.createElement('section');dialog.setAttribute('role','dialog');dialog.textContent='Visible requested dialog';dialog.style='visibility:visible;background:white;padding:40px';
    wrapper.append(dialog);veil.append(wrapper);document.body.append(veil);
   };document.body.append(b);
  });
  await env.page.locator('#requested-dialog').click();await expect(env.page.getByRole('dialog')).toBeVisible();
  const panel=await env.panel();await expect(panel.locator('#overlays')).toHaveText('0');
 }finally{await env.close()}
});


test('site autorisé au chargement : réactiver puis désactiver sans recharger, iframe et compteur sans doublon',async()=>{
 const env=await setup();
 try {
  let panel=await env.panel();await panel.locator('#exception').check();await expect(panel.locator('#status')).toContainText('Enregistré');await panel.close();
  await env.page.reload();
  await env.page.evaluate(url=>{const f=document.createElement('iframe');f.src=url;document.body.append(f)},origin);
  await expect.poll(()=>env.page.frames().length).toBe(2);const frame=env.page.frames().find(f=>f.parentFrame());await frame.waitForLoadState();
  const documentToken=await env.page.evaluate(()=>window.liveDocumentToken=crypto.randomUUID());
  panel=await env.panel();await panel.locator('#exception').uncheck();await expect(panel.locator('#status')).toContainText('Enregistré');
  expect(await env.page.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
  expect(await frame.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);
  await expect(panel.locator('#popups')).toHaveText('2');
  await panel.locator('#exception').check();await expect(panel.locator('#status')).toContainText('Enregistré');
  const opened=env.context.waitForEvent('page');expect(await env.page.evaluate(()=>window.open('/target','_blank')!==null)).toBe(true);await(await opened).close();
  await panel.locator('#exception').uncheck();await expect(panel.locator('#status')).toContainText('Enregistré');
  expect(await env.page.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);await expect(panel.locator('#popups')).toHaveText('3');
  await panel.locator('#basic').uncheck();await expect(panel.locator('#status')).toContainText('Enregistré');
  const basicOpen=env.context.waitForEvent('page');expect(await env.page.evaluate(()=>window.open('/target','_blank')!==null)).toBe(true);await(await basicOpen).close();
  await panel.locator('#basic').check();await expect(panel.locator('#status')).toContainText('Enregistré');
  expect(await env.page.evaluate(()=>window.open('/target','_blank')===null)).toBe(true);await expect(panel.locator('#popups')).toHaveText('4');
  expect(await env.page.evaluate(()=>window.liveDocumentToken)).toBe(documentToken);expect(env.errors).toEqual([]);
 }finally{await env.close()}
});


test('sélection multiple avec Maj, mémorisation, clic simple et Échap',async()=>{
 const env=await setup();
 try {
  await env.page.evaluate(()=>{for(let i=0;i<4;i++){const n=document.createElement('p');n.id=`pick-item-${i}`;n.textContent=`Selectable item ${i}`;document.body.append(n)}});
  let panel=await env.panel();await panel.locator('#remember').check();await panel.locator('#pick').click();
  await env.page.locator('#pick-item-0').click({modifiers:['Shift']});await expect(env.page.locator('#pick-item-0')).toBeHidden();
  await expect.poll(()=>env.worker.evaluate(()=>chrome.storage.local.get('settings').then(x=>x.settings.rules.localhost))).toContain('#pick-item-0');
  await env.page.locator('#pick-item-1').click({modifiers:['Shift']});await expect(env.page.locator('#pick-item-1')).toBeHidden();
  await expect.poll(()=>env.worker.evaluate(()=>chrome.storage.local.get('settings').then(x=>x.settings.rules.localhost))).toContain('#pick-item-1');
  await env.page.keyboard.press('Escape');await env.page.locator('#pick-item-2').click();await expect(env.page.locator('#pick-item-2')).toBeVisible();
  panel=await env.panel();await panel.locator('#pick').click();
  await env.page.locator('#pick-item-2').click();await expect(env.page.locator('#pick-item-2')).toBeHidden();
  await env.page.locator('#pick-item-3').click();await expect(env.page.locator('#pick-item-3')).toBeVisible();
  panel=await env.panel();await expect(panel.locator('#overlays')).toHaveText('3');
  expect(env.errors).toEqual([]);
 }finally{await env.close()}
});


test('barre overlay temporaire, restauration disponible après disparition',async()=>{
 const env=await setup();
 try {
  await overlay(env.page);await expect(env.page.locator('[data-clear-popup-ui]')).toBeVisible();
  await expect(env.page.locator('[data-clear-popup-ui]')).toHaveCount(0,{timeout:7000});
  await expect(env.page.locator('#test-overlay')).toBeHidden();
  const panel=await env.panel();await panel.locator('#undo').click();await expect(env.page.locator('#test-overlay')).toBeVisible();
  await expect(panel.locator('#overlays')).toHaveText('1');expect(env.errors).toEqual([]);
 }finally{await env.close()}
});
