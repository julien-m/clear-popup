import {normalize, hostname, validHost} from './core.js';
const SCRIPT_ID = 'clear-popup-main';
let queue = Promise.resolve();
function serial(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }
async function settings() { return normalize((await chrome.storage.local.get('settings')).settings); }
async function registration(config) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]});
  if (!config.enabled || !config.basic) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]});
    return;
  }
  const spec = {id: SCRIPT_ID, matches: ['http://*/*', 'https://*/*'], excludeMatches: config.exceptions.map(host => `*://${host}/*`), js: ['main.js'], runAt: 'document_start', world: 'MAIN', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true};
  if (existing.length) await chrome.scripting.updateContentScripts([spec]);
  else await chrome.scripting.registerContentScripts([spec]);
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
  await chrome.action.setBadgeBackgroundColor({tabId, color: '#175c4b'});
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
      return {ok: true};
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
      await chrome.storage.local.set({settings: config}); await registration(config); return {ok: true};
    }
    return {ok: false};
  };
  serial(operation).then(reply, error => reply({ok: false, error: error.message}));
  return true;
});
