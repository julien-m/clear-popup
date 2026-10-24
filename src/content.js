(() => {
  'use strict';
  const {message: t, setLocale} = globalThis.ExtensionI18n;
  let config = {enabled: true, basic: true, advanced: true, exceptions: [], rules: {}};
  let active = false, configReady = globalThis.clearPopupAdvancedStart === true, picking = false, rememberPick = false;
  let lastInteraction = -Infinity, pendingPopups = 0, countTimer = 0;
  let host = location.hostname;
  if (!host) { try { host = new URL(location.ancestorOrigins[0]).hostname; } catch { /* opaque frame */ } }
  const removed = new Map();
  const undone = new WeakSet();
  const locks = new Map();
  let toolbar, shadow, outlineStyle, highlighted, popupNotice;
  let firstPopupNotified = false, toolbarTimer = 0;
  const send = message => chrome.runtime.sendMessage(message).catch(() => ({ok: false}));
  const enabled = () => config.enabled && !config.exceptions.includes(host);
  function mainConfig() { window.dispatchEvent(new CustomEvent('clear-popup:config', {detail: {enabled: enabled() && config.basic}})); }
  window.addEventListener('clear-popup:ready', mainConfig);
  window.addEventListener('clear-popup:blocked', () => {
    if (!enabled() || !config.basic) return;
    firstPopup();
    pendingPopups = Math.min(100, pendingPopups + 1);
    if (!countTimer) countTimer = setTimeout(() => { send({type: 'count', popups: pendingPopups}); pendingPopups = 0; countTimer = 0; }, 150);
  });
  function withinOurs(node) { return node === toolbar || toolbar?.contains(node) || node === popupNotice || popupNotice?.contains(node); }
  function dismissPopupNotice() { popupNotice?.remove(); popupNotice = null; }
  function firstPopup(source = {}) {
    if (firstPopupNotified || !enabled() || !config.basic) return;
    firstPopupNotified = true;
    if (window !== top) { send({type: 'popup-notice'}); return; }
    const blockedHost = source.host || host;
    popupNotice = document.createElement('div'); popupNotice.setAttribute('data-clear-popup-notice', ''); setLocale(popupNotice);
    const root = popupNotice.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = globalThis.clearPopupThemeCSS;
    const box = document.createElement('section'); box.setAttribute('aria-label', t('noticeRegion')); box.setAttribute('role', 'region');
    const heading = document.createElement('strong'); heading.textContent = t('noticeHeading');
    const text = document.createElement('p'); text.setAttribute('role', 'status'); text.textContent = t('noticeBlocked', [blockedHost]);
    const hint = document.createElement('small'); hint.textContent = t('noticeHint');
    const actions = document.createElement('div');
    const allow = document.createElement('button'); allow.textContent = t('allowSite');
    const keep = document.createElement('button'); keep.textContent = t('keepBlocked');
    keep.addEventListener('click', event => { if (event.isTrusted) dismissPopupNotice(); });
    allow.addEventListener('click', async event => {
      if (!event.isTrusted) return;
      allow.disabled = keep.disabled = true;
      const result = await send({type: 'allow-site', documentId: source.documentId});
      if (!result?.ok) { text.textContent = t('allowFailed'); allow.disabled = keep.disabled = false; return; }
      text.textContent = t('siteAllowedReload', [result.host]);
      hint.textContent = t('removeExceptionHint');
      allow.textContent = t('reloadPage'); allow.disabled = false;
      // Replace the permission handler; reloading remains an explicit second choice.
      const reload = allow.cloneNode(true); allow.replaceWith(reload);
      reload.addEventListener('click', click => { if (click.isTrusted) location.reload(); });
      keep.textContent = t('close'); keep.disabled = false;
    });
    actions.append(allow, keep); box.append(heading, text, hint, actions); root.append(style, box);
    (document.documentElement || document).append(popupNotice);
  }
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
  function dismissToolbar() { clearTimeout(toolbarTimer); toolbarTimer = 0; toolbar?.remove(); toolbar = null; }
  function scheduleToolbarDismiss() {
    clearTimeout(toolbarTimer);
    toolbarTimer = setTimeout(() => {
      if (shadow?.activeElement || toolbar?.matches(':hover')) { scheduleToolbarDismiss(); return; }
      dismissToolbar();
    }, 5000);
  }
  function controls() {
    if (toolbar || !document.documentElement) return;
    toolbar = document.createElement('div');
    toolbar.setAttribute('data-clear-popup-ui', ''); setLocale(toolbar); shadow = toolbar.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = globalThis.clearPopupThemeCSS;
    const section = document.createElement('section'); section.setAttribute('aria-label', t('extensionName'));
    const label = document.createElement('span'); label.textContent = t('overlayHidden');
    const undo = document.createElement('button'); undo.textContent = t('restore'); undo.addEventListener('click', () => { restoreLast(); });
    const dismiss = document.createElement('button'); dismiss.textContent = t('close'); dismiss.setAttribute('aria-label', t('closeToolbar')); dismiss.addEventListener('click', dismissToolbar);
    toolbar.addEventListener('pointerleave', scheduleToolbarDismiss);
    toolbar.addEventListener('focusout', scheduleToolbarDismiss);
    section.append(label, undo, dismiss); shadow.append(style, section); document.documentElement.append(toolbar);
  }
  function hide(node, reason) {
    if (!(node instanceof HTMLElement) || removed.has(node) || undone.has(node) || withinOurs(node) || ['HTML', 'BODY'].includes(node.tagName)) return false;
    const r = node.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(node).display === 'none') return false;
    removed.set(node, {value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display')});
    node.style.setProperty('display', 'none', 'important');
    unlockScroll(); controls(); scheduleToolbarDismiss(); send({type: 'count', overlays: 1});
    if (reason === 'manual' && rememberPick) { const selector = selectorFor(node); if (selector) send({type: 'remember', selector}); }
    return true;
  }
  function restoreLast() {
    const entry = [...removed.entries()].at(-1); if (!entry) return false;
    const [node, value] = entry; removed.delete(node); undone.add(node);
    if (node.style.getPropertyValue('display') === 'none' && node.style.getPropertyPriority('display') === 'important') {
      if (value.value) node.style.setProperty('display', value.value, value.priority); else node.style.removeProperty('display');
    }
    if (!removed.size) { restoreLocks(); dismissToolbar(); }
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
  function orphanBackdrop(node, style, rect) {
    if (style.position !== 'fixed' || style.pointerEvents === 'none' || style.backgroundImage !== 'none' || Number.parseInt(style.zIndex, 10) < 1) return false;
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    if (rect.width < width * .9 || rect.height < height * .9 || rect.left > width * .05 || rect.top > height * .05 || rect.right < width * .95 || rect.bottom < height * .95) return false;
    if (!/(^|[-_\s])(overlay|backdrop|modal|lightbox)([-_\s]|$)/i.test(`${node.id} ${node.className}`)) return false;
    if (!node.children.length || node.childNodes.length > 20) return false;
    if ([...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim())) return false;
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(node, pseudo).content;
      if (!['none', 'normal', '""'].includes(content)) return false;
    }
    return [...node.children].every(child => {
      const s = getComputedStyle(child);
      return s.display === 'none' || Number(s.opacity) === 0;
    });
  }
  function isIntrusive(node, force) {
    if (!(node instanceof HTMLElement) || withinOurs(node) || undone.has(node) || removed.has(node)) return false;
    const s = getComputedStyle(node), r = node.getBoundingClientRect();
    if (!['fixed', 'absolute'].includes(s.position) && node.tagName !== 'DIALOG') return false;
    if (s.visibility !== 'visible' || s.display === 'none' || Number(s.opacity) === 0 || r.width < 100 || r.height < 100) return false;
    // A cosmetic filter can hide the card but leave its blocking backdrop.
    // Removing that empty shell is safe even immediately after a user click.
    if (orphanBackdrop(node, s, r)) return true;
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
    if (!configReady || !active || !enabled() || !config.advanced || document.hidden) return;
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
  function inspectMutations(records) {
    active = !!document.documentElement;
    if (records && records.every(record => withinOurs(record.target) || removed.has(record.target))) return;
    // MutationObserver runs at the microtask checkpoint before rendering. A timer
    // or a next-frame callback here would allow a newly inserted overlay to flash.
    scan();
  }
  const observer = new MutationObserver(inspectMutations);
  function configure() {
    mainConfig(); observer.disconnect();
    if (!configReady) return;
    if (!enabled() || !config.advanced) { while (removed.size) restoreLast(); return; }
    // Watch the Document even before <html> exists; do not wait for DOMContentLoaded.
    active = !!document.documentElement;
    observer.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['class','style','open','hidden','aria-modal']});
    scan();
  }
  function stopPick() {
    picking = false; if (highlighted) highlighted.style.outline = outlineStyle;
    highlighted = null; document.removeEventListener('pointerover', hoverPick, true); document.removeEventListener('click', clickPick, true); document.removeEventListener('keydown', keyPick, true);
  }
  function hoverPick(event) {
    if (withinOurs(event.target) || !(event.target instanceof HTMLElement)) return;
    if (highlighted) highlighted.style.outline = outlineStyle;
    highlighted = event.target; outlineStyle = highlighted.style.outline; highlighted.style.outline = '3px solid #3d4fd6';
  }
  function clickPick(event) {
    if (withinOurs(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation(); const node = event.target;
    if (!event.shiftKey) stopPick();
    else { if (highlighted) highlighted.style.outline = outlineStyle; highlighted = null; }
    hide(node, 'manual');
  }
  function keyPick(event) { if (event.key === 'Escape') { event.preventDefault(); stopPick(); } }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'apply-settings') { config = message.config; configReady = true; stopPick(); configure(); reply({ok: true}); return; }
    if (message.type === 'get-origin') { reply({host}); return; }
    if (message.type === 'blocked-popup') { firstPopup(message); reply({ok: true}); return; }
    if (message.type === 'undo') reply({ok: restoreLast()});
    if (message.type === 'scan') { scan(true); reply({ok: true}); }
    if (message.type === 'pick') {
      if (!enabled()) { reply({ok: false, error: t('protectionOffOnSite')}); return; }
      if (picking) stopPick(); picking = true; rememberPick = message.remember === true;
      document.addEventListener('pointerover', hoverPick, true); document.addEventListener('click', clickPick, true); document.addEventListener('keydown', keyPick, true); reply({ok: true});
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { config = changes.settings.newValue || config; if (!enabled()) stopPick(); configure(); } });
  window.addEventListener('clear-popup:advanced-ready', () => {
    if (globalThis.clearPopupAdvancedStart === true) { configReady = true; configure(); }
  });
  if (configReady) configure();
  if (window === top) send({type: 'reset'});
  chrome.storage.local.get('settings').then(result => { if (result.settings) config = result.settings; configReady = true; configure(); }).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  window.addEventListener('resize', () => scan(), {passive: true});
})();
