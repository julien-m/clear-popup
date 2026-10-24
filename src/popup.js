import './i18n.js';
const {message: t, render: translate, setLocale} = globalThis.ExtensionI18n;
setLocale(document.documentElement);
translate(document);
const formatNumber = new Intl.NumberFormat(chrome.i18n.getUILanguage());
const $ = id => document.getElementById(id);
let state, busy = false;
async function call(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || t('actionUnavailable'));
  return result;
}
function counts(value) {
  $('popups').textContent = t(value.popups === 1 ? 'popupsBlockedOne' : 'popupsBlockedMany', [formatNumber.format(value.popups)]);
  $('overlays').textContent = t(value.overlays === 1 ? 'overlaysHiddenOne' : 'overlaysHiddenMany', [formatNumber.format(value.overlays)]);
}
function render() {
  for (const key of ['enabled','basic','advanced']) $(key).checked = state.config[key];
  const allowed = state.config.exceptions.includes(state.host);
  const protecting = state.config.enabled && !allowed && (state.config.basic || state.config.advanced);
  $('exception').checked = allowed;
  $('protection-state').textContent = t(!state.host ? 'unsupportedPage' : allowed ? 'protectionAllowed' : protecting ? 'protectionActive' : 'protectionOff');
  document.querySelector('.summary').dataset.protection = protecting ? 'active' : allowed ? 'allowed' : 'off';
  $('host').textContent = state.host || t('unsupportedPage'); $('host').removeAttribute('data-i18n'); counts(state.counts);
  for (const key of ['exception','pick','undo','scan']) $(key).disabled = !state.host;
  for (const key of ['pick','scan']) $(key).disabled = !state.host || !protecting;
  $('data-summary').textContent = t('dataSummary', [formatNumber.format(state.config.exceptions.length), formatNumber.format(Object.values(state.config.rules).reduce((n, rules) => n + rules.length, 0))]);
}
async function run(fn) {
  if (busy) return; busy = true; $('status').textContent = '';
  try { await fn(); } catch (error) { $('status').textContent = error.message; } finally { busy = false; }
}
for (const key of ['enabled','basic','advanced','exception']) $(key).addEventListener('change', () => run(async () => {
  const config = structuredClone(state.config);
  if (key === 'exception') config.exceptions = $(key).checked ? [...new Set([...config.exceptions,state.host])] : config.exceptions.filter(host => host !== state.host);
  else config[key] = $(key).checked;
  const result = await call({type:'save', config}); state.config = config; render();
  $('status').textContent = result.reloadTabs ? t(result.reloadTabs === 1 ? 'savedReloadOne' : 'savedReloadMany', [formatNumber.format(result.reloadTabs)]) : t('savedApplied');
}));
for (const command of ['scan','pick','undo']) $(command).addEventListener('click', () => run(async () => {
  await call({type:'command', command, tabId:state.tabId, remember:$('remember').checked});
  if (command === 'pick') window.close();
  else $('status').textContent = t(command === 'undo' ? 'elementRestored' : 'scanComplete');
}));
$('erase').addEventListener('click', () => run(async () => {
  await call({type:'erase'}); state = await call({type:'get'}); render(); $('status').textContent = t('dataCleared');
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && state && changes[`tab-${state.tabId}`]) counts(changes[`tab-${state.tabId}`].newValue || {popups:0,overlays:0});
});
run(async () => { state = await call({type:'get'}); render(); });
