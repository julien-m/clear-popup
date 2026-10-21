(() => {
  'use strict';
  let config = {enabled: true, basic: true, advanced: true, exceptions: [], rules: {}};
  let active = false, picking = false, rememberPick = false;
  let lastInteraction = -Infinity, timer = 0, pendingPopups = 0, countTimer = 0;
  let host = location.hostname;
  if (!host) { try { host = new URL(location.ancestorOrigins[0]).hostname; } catch { /* opaque frame */ } }
  const removed = new Map();
  const undone = new WeakSet();
  const locks = new Map();
  let toolbar, shadow, outlineStyle, highlighted;
  const send = message => chrome.runtime.sendMessage(message).catch(() => ({ok: false}));
  const enabled = () => config.enabled && !config.exceptions.includes(host);
  function mainConfig() { window.dispatchEvent(new CustomEvent('clear-popup:config', {detail: {enabled: enabled() && config.basic}})); }
  window.addEventListener('clear-popup:ready', mainConfig);
  window.addEventListener('clear-popup:blocked', () => {
    if (!enabled() || !config.basic) return;
    pendingPopups = Math.min(100, pendingPopups + 1);
    if (!countTimer) countTimer = setTimeout(() => { send({type: 'count', popups: pendingPopups}); pendingPopups = 0; countTimer = 0; }, 150);
  });
  function withinOurs(node) { return node === toolbar || toolbar?.contains(node); }
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, event => {
    if (event.isTrusted && !withinOurs(event.composedPath()[0])) lastInteraction = performance.now();
  }, true);
  function restoreLocks() {
    for (const [node, values] of locks) for (const [key, old] of values) {
      // Do not overwrite a later change made by the site.
      if (node.style.getPropertyValue(key) === 'auto' && node.style.getPropertyPriority(key) === 'important') {
        if (old.value) node.style.setProperty(key, old.value, old.priority); else node.style.removeProperty(key);
      }
    }
    locks.clear();
  }
  function unlockScroll() {
    for (const node of [document.documentElement, document.body]) {
      if (!node || locks.has(node)) continue;
      const computed = getComputedStyle(node);
      const values = [];
      for (const key of ['overflow-x', 'overflow-y']) if (['hidden', 'clip'].includes(computed.getPropertyValue(key))) {
        values.push([key, {value: node.style.getPropertyValue(key), priority: node.style.getPropertyPriority(key)}]);
        node.style.setProperty(key, 'auto', 'important');
      }
      if (values.length) locks.set(node, values);
    }
  }
  function controls() {
    if (toolbar || !document.documentElement) return;
    toolbar = document.createElement('div');
    toolbar.setAttribute('data-clear-popup-ui', ''); shadow = toolbar.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;position:fixed!important;bottom:16px!important;right:16px!important;z-index:2147483647!important;font:13px system-ui!important;color:#fff!important}section{display:flex;gap:10px;align-items:center;background:#123d33;border:1px solid #7bbaa6;border-radius:12px;padding:10px 14px;box-shadow:0 4px 24px #0004}button{font:inherit;background:#fff;color:#123d33;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}';
    const section = document.createElement('section'); section.setAttribute('aria-label', 'Clear Pop Up');
    const label = document.createElement('span'); label.textContent = 'Clear Pop Up · overlay masqué';
    const undo = document.createElement('button'); undo.textContent = 'Restaurer'; undo.addEventListener('click', () => { restoreLast(); });
    const dismiss = document.createElement('button'); dismiss.textContent = 'Fermer'; dismiss.setAttribute('aria-label', 'Fermer la barre'); dismiss.addEventListener('click', () => { toolbar.remove(); toolbar = null; });
    section.append(label, undo, dismiss); shadow.append(style, section); document.documentElement.append(toolbar);
  }
  function hide(node, reason) {
    if (!(node instanceof HTMLElement) || removed.has(node) || undone.has(node) || withinOurs(node) || ['HTML', 'BODY'].includes(node.tagName)) return false;
    const r = node.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(node).display === 'none') return false;
    removed.set(node, {value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display')});
    node.style.setProperty('display', 'none', 'important');
    unlockScroll(); controls(); send({type: 'count', overlays: 1});
    if (reason === 'manual' && rememberPick) { const selector = selectorFor(node); if (selector) send({type: 'remember', selector}); }
    return true;
  }
  function restoreLast() {
    const entry = [...removed.entries()].at(-1); if (!entry) return false;
    const [node, value] = entry; removed.delete(node); undone.add(node);
    if (node.style.getPropertyValue('display') === 'none' && node.style.getPropertyPriority('display') === 'important') {
      if (value.value) node.style.setProperty('display', value.value, value.priority); else node.style.removeProperty('display');
    }
    if (!removed.size) { restoreLocks(); toolbar?.remove(); toolbar = null; }
    send({type: 'undone'});
    return true;
  }
  function selectorFor(node) {
    if (node.id && node.id.length <= 80) { const selector = `#${CSS.escape(node.id)}`; if (document.querySelectorAll(selector).length === 1) return selector; }
    const classes = [...node.classList].filter(c => c.length <= 50).slice(0, 3);
    if (!classes.length) return null;
    const selector = `${node.tagName.toLowerCase()}${classes.map(c => `.${CSS.escape(c)}`).join('')}`;
    return document.querySelectorAll(selector).length === 1 ? selector : null;
  }
  function isIntrusive(node, force) {
    if (!(node instanceof HTMLElement) || withinOurs(node) || undone.has(node) || removed.has(node)) return false;
    const s = getComputedStyle(node), r = node.getBoundingClientRect();
    if (!['fixed', 'absolute'].includes(s.position) && node.tagName !== 'DIALOG') return false;
    if (s.visibility !== 'visible' || s.display === 'none' || Number(s.opacity) === 0 || r.width < 100 || r.height < 100) return false;
    if (!force && performance.now() - lastInteraction < 1800) return false;
    if (!force && (node.matches('[role="alert"],[role="alertdialog"]') || node.contains(document.activeElement) && document.activeElement !== document.body)) return false;
    const area = r.width * r.height / (innerWidth * innerHeight);
    const nearCenter = r.left < innerWidth * .6 && r.right > innerWidth * .4 && r.top < innerHeight * .6 && r.bottom > innerHeight * .4;
    const named = /(^|[-_\s])(popup|pop-up|overlay|modal|interstitial|lightbox)([-_\s]|$)/i.test(`${node.id} ${node.className}`);
    const dialog = node.matches('dialog[open],[role="dialog"][aria-modal="true"]');
    const elevated = Number.parseInt(s.zIndex, 10) >= 100;
    // Geometry plus a structural signal; banners/sticky menus alone are left intact.
    return nearCenter && area >= .15 && (dialog || (named && elevated) || (area >= .85 && elevated && s.pointerEvents !== 'none'));
  }
  function scan(force = false) {
    if (!active || !enabled() || !config.advanced || document.hidden) return;
    for (const selector of config.rules[host] || []) {
      try { for (const node of [...document.querySelectorAll(selector)].slice(0, 20)) hide(node, 'remembered'); } catch { /* obsolete rule */ }
    }
    const points = [[.5,.5],[.25,.5],[.75,.5]];
    const candidates = new Set();
    for (const [x,y] of points) {
      let node = document.elementFromPoint(innerWidth*x, innerHeight*y);
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) candidates.add(node);
    }
    for (const node of candidates) if (isIntrusive(node, force)) hide(node, 'automatic');
  }
  function schedule(records) {
    if (!enabled() || !config.advanced || timer || document.hidden) return;
    if (records && records.every(record => withinOurs(record.target) || removed.has(record.target))) return;
    timer = setTimeout(() => { timer = 0; scan(); }, 120);
  }
  const observer = new MutationObserver(schedule);
  function configure() {
    mainConfig(); observer.disconnect(); clearTimeout(timer); timer = 0;
    if (!enabled() || !config.advanced) { while (removed.size) restoreLast(); return; }
    if (active) { observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['class','style','open','aria-modal']}); schedule(); }
  }
  function stopPick() {
    picking = false; if (highlighted) highlighted.style.outline = outlineStyle;
    highlighted = null; document.removeEventListener('pointerover', hoverPick, true); document.removeEventListener('click', clickPick, true); document.removeEventListener('keydown', keyPick, true);
  }
  function hoverPick(event) {
    if (withinOurs(event.target) || !(event.target instanceof HTMLElement)) return;
    if (highlighted) highlighted.style.outline = outlineStyle;
    highlighted = event.target; outlineStyle = highlighted.style.outline; highlighted.style.outline = '3px solid #1eaf82';
  }
  function clickPick(event) {
    if (withinOurs(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation(); const node = event.target; stopPick(); hide(node, 'manual');
  }
  function keyPick(event) { if (event.key === 'Escape') { event.preventDefault(); stopPick(); } }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'undo') reply({ok: restoreLast()});
    if (message.type === 'scan') { scan(true); reply({ok: true}); }
    if (message.type === 'pick') {
      if (!enabled()) { reply({ok: false, error: 'Protection désactivée sur ce site.'}); return; }
      if (picking) stopPick(); picking = true; rememberPick = message.remember === true;
      document.addEventListener('pointerover', hoverPick, true); document.addEventListener('click', clickPick, true); document.addEventListener('keydown', keyPick, true); reply({ok: true});
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { config = changes.settings.newValue || config; stopPick(); configure(); } });
  if (window === top) send({type: 'reset'});
  chrome.storage.local.get('settings').then(result => { if (result.settings) config = result.settings; configure(); }).catch(() => {});
  function start() { active = true; configure(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.addEventListener('resize', () => schedule(), {passive: true});
})();
