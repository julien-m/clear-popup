const $ = id => document.getElementById(id);
let state, busy = false;
async function call(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Action unavailable. Reload the page and try again.');
  return result;
}
function counts(value) { $('popups').textContent = value.popups; $('overlays').textContent = value.overlays; }
function render() {
  for (const key of ['enabled','basic','advanced']) $(key).checked = state.config[key];
  const allowed = state.config.exceptions.includes(state.host);
  const protecting = state.config.enabled && !allowed && (state.config.basic || state.config.advanced);
  $('exception').checked = allowed;
  $('protection-state').textContent = !state.host ? 'Unsupported page' : allowed ? 'Allowed on this site' : protecting ? 'Protection active' : 'Protection off';
  document.querySelector('.summary').dataset.protection = protecting ? 'active' : allowed ? 'allowed' : 'off';
  $('host').textContent = state.host || 'Unsupported page'; counts(state.counts);
  for (const key of ['exception','pick','undo','scan']) $(key).disabled = !state.host;
  for (const key of ['pick','scan']) $(key).disabled = !state.host || !protecting;
  $('data-summary').textContent = `${state.config.exceptions.length} site exception(s), ${Object.values(state.config.rules).reduce((n, rules) => n + rules.length, 0)} saved selection(s).`;
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
  $('status').textContent = result.reloadTabs ? `Saved. ${result.reloadTabs} tab(s) could not be updated. Reload those tabs.` : 'Saved and applied to open pages.';
}));
for (const command of ['scan','pick','undo']) $(command).addEventListener('click', () => run(async () => {
  await call({type:'command', command, tabId:state.tabId, remember:$('remember').checked});
  if (command === 'pick') window.close();
  else $('status').textContent = command === 'undo' ? 'Element restored on this page.' : 'Scan complete.';
}));
$('erase').addEventListener('click', () => run(async () => {
  await call({type:'erase'}); state = await call({type:'get'}); render(); $('status').textContent = 'Exceptions and saved selections cleared.';
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && state && changes[`tab-${state.tabId}`]) counts(changes[`tab-${state.tabId}`].newValue || {popups:0,overlays:0});
});
run(async () => { state = await call({type:'get'}); render(); });
