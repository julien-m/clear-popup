import {normalize, hostname, validHost} from './core.js';
const SCRIPT_ID = 'clear-popup-main';
let queue = Promise.resolve();
function serial(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }
async function settings() { return normalize((await chrome.storage.local.get('settings')).settings); }
async function registration(config) {
  for (const [id, enabled, file, world] of [
    [SCRIPT_ID, config.basic, 'main.js', 'MAIN'],
    ['clear-popup-advanced', config.advanced, 'advanced-start.js', 'ISOLATED'],
  ]) {
    const existing = await chrome.scripting.getRegisteredContentScripts({ids: [id]});
    if (!config.enabled || !enabled) {
      if (existing.length) await chrome.scripting.unregisterContentScripts({ids: [id]});
      continue;
    }
    const spec = {id, matches: ['http://*/*', 'https://*/*'], excludeMatches: config.exceptions.map(host => `*://${host}/*`), js: [file], runAt: 'document_start', world, allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true};
    if (existing.length) await chrome.scripting.updateContentScripts([spec]);
    else await chrome.scripting.registerContentScripts([spec]);
  }
}
async function applyOpenTabs(config) {
  const tabs = await chrome.tabs.query({});
  const results = await Promise.all(tabs.filter(tab => hostname(tab.url)).map(async tab => {
    try {
      const applied = await chrome.tabs.sendMessage(tab.id, {type: 'apply-settings', config});
      if (!applied?.ok) return false;
      if (config.enabled && config.basic) {
        // Existing allowed pages never received MAIN at document_start. Install
        // it now; its ready handshake takes each frame's current configuration.
        await chrome.scripting.executeScript({target: {tabId: tab.id, allFrames: true}, files: ['main.js'], world: 'MAIN'});
      }
      return true;
    } catch { return false; } // Closed tabs or old extension contexts need a reload.
  }));
  return results.filter(ok => !ok).length;
}
async function count(tabId, change, sender) {
  const key = `tab-${tabId}`;
  const old = (await chrome.storage.session.get(key))[key] || {popups: 0, overlays: 0};
  const value = {...old};
  for (const type of ['popups', 'overlays']) value[type] = Math.min(99999, value[type] + Math.max(0, Math.min(100, Math.trunc(change[type] || 0))));
  value.undoFrames = Array.isArray(old.undoFrames) ? [...old.undoFrames] : [];
  if (sender && change.overlays > 0) value.undoFrames = [...value.undoFrames, {frameId: sender.frameId, documentId: sender.documentId}].slice(-100);
  await chrome.storage.session.set({[key]: value});
  const total = value.popups + value.overlays;
  await chrome.action.setBadgeBackgroundColor({tabId, color: '#3d4fd6'});
  await chrome.action.setBadgeText({tabId, text: total ? (total > 999 ? '999+' : String(total)) : ''});
}
chrome.runtime.onInstalled.addListener(() => serial(async () => { const config = await settings(); await chrome.storage.local.set({settings: config}); await registration(config); }));
chrome.runtime.onStartup.addListener(() => serial(async () => registration(await settings())));
chrome.tabs.onRemoved.addListener(tabId => serial(() => chrome.storage.session.remove(`tab-${tabId}`)));
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') return;
  const fromPanel = sender.url === chrome.runtime.getURL('popup.html');
  const operation = async () => {
    if (sender.tab && !fromPanel) {
      if (message.type === 'popup-notice') {
        return await chrome.tabs.sendMessage(sender.tab.id, {type: 'blocked-popup', host: hostname(sender.url), documentId: sender.documentId}, {frameId: 0});
      }
      if (message.type === 'allow-site') {
        let host = hostname(sender.url);
        if (message.documentId !== undefined) {
          if (sender.frameId !== 0 || typeof message.documentId !== 'string' || message.documentId.length > 128) return {ok: false};
          const origin = await chrome.tabs.sendMessage(sender.tab.id, {type: 'get-origin'}, {documentId: message.documentId});
          host = origin?.host;
        }
        if (!validHost(host)) return {ok: false};
        const config = await settings();
        config.exceptions = [...new Set([...config.exceptions, host])];
        const normalized = normalize(config);
        if (!normalized.exceptions.includes(host)) return {ok: false};
        await registration(normalized);
        await chrome.storage.local.set({settings: normalized});
        const reloadTabs = await applyOpenTabs(normalized);
        return {ok: true, host, reloadTabs};
      }
      if (message.type === 'count') { await count(sender.tab.id, message, sender); return {ok: true}; }
      if (message.type === 'undone') {
        const key = `tab-${sender.tab.id}`;
        const value = (await chrome.storage.session.get(key))[key];
        if (value?.undoFrames) {
          const index = value.undoFrames.findLastIndex(frame => frame.documentId === sender.documentId);
          if (index >= 0) value.undoFrames.splice(index, 1);
          await chrome.storage.session.set({[key]: value});
        }
        return {ok: true};
      }
      if (message.type === 'reset' && sender.frameId === 0) { await chrome.storage.session.remove(`tab-${sender.tab.id}`); await count(sender.tab.id, {}); return {ok: true}; }
      if (message.type === 'remember' && typeof message.selector === 'string' && message.selector.length <= 250) {
        const host = hostname(sender.url); if (!host) return {ok: false};
        const config = await settings(); config.rules[host] = [...new Set([...(config.rules[host] || []), message.selector])].slice(-50);
        await chrome.storage.local.set({settings: normalize(config)}); return {ok: true};
      }
      return {ok: false};
    }
    if (!fromPanel) return {ok: false};
    if (message.type === 'get') {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const config = await settings();
      return {ok: true, config, host: hostname(tab?.url), tabId: tab?.id, counts: (await chrome.storage.session.get(`tab-${tab?.id}`))[`tab-${tab?.id}`] || {popups: 0, overlays: 0}};
    }
    if (message.type === 'save') {
      const config = normalize(message.config); await chrome.storage.local.set({settings: config}); await registration(config);
      return {ok: true, reloadTabs: await applyOpenTabs(config)};
    }
    if (message.type === 'command' && Number.isInteger(message.tabId) && ['pick', 'undo', 'scan'].includes(message.command)) {
      let target = {frameId: 0};
      if (message.command === 'undo') {
        const value = (await chrome.storage.session.get(`tab-${message.tabId}`))[`tab-${message.tabId}`];
        const frame = value?.undoFrames?.at(-1);
        if (frame) target = {documentId: frame.documentId};
      }
      return await chrome.tabs.sendMessage(message.tabId, {type: message.command, remember: message.remember === true}, target);
    }
    if (message.type === 'erase') {
      const config = await settings(); config.rules = {}; config.exceptions = [];
      await chrome.storage.local.set({settings: config}); await registration(config); return {ok: true, reloadTabs: await applyOpenTabs(config)};
    }
    return {ok: false};
  };
  serial(operation).then(reply, error => reply({ok: false, error: error.message}));
  return true;
});
