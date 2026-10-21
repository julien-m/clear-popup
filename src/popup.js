const $ = id => document.getElementById(id);
let state, busy = false;
async function call(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Action indisponible. Rechargez la page et réessayez.');
  return result;
}
function counts(value) { $('popups').textContent = value.popups; $('overlays').textContent = value.overlays; }
function render() {
  for (const key of ['enabled','basic','advanced']) $(key).checked = state.config[key];
  $('exception').checked = state.config.exceptions.includes(state.host);
  $('host').textContent = state.host || 'Page non prise en charge'; counts(state.counts);
  for (const key of ['exception','pick','undo','scan']) $(key).disabled = !state.host;
  $('data-summary').textContent = `${state.config.exceptions.length} exception(s), ${Object.values(state.config.rules).reduce((n, rules) => n + rules.length, 0)} choix mémorisé(s).`;
}
async function run(fn) {
  if (busy) return; busy = true; $('status').textContent = '';
  try { await fn(); } catch (error) { $('status').textContent = error.message; } finally { busy = false; }
}
for (const key of ['enabled','basic','advanced','exception']) $(key).addEventListener('change', () => run(async () => {
  const config = structuredClone(state.config);
  if (key === 'exception') config.exceptions = $(key).checked ? [...new Set([...config.exceptions,state.host])] : config.exceptions.filter(host => host !== state.host);
  else config[key] = $(key).checked;
  await call({type:'save', config}); state.config = config; render();
  $('status').textContent = 'Enregistré. Rechargez la page pour appliquer les changements dès son ouverture.';
}));
for (const command of ['scan','pick','undo']) $(command).addEventListener('click', () => run(async () => {
  await call({type:'command', command, tabId:state.tabId, remember:$('remember').checked});
  if (command === 'pick') window.close();
  else $('status').textContent = command === 'undo' ? 'Élément restauré pour cette page.' : 'Recherche terminée.';
}));
$('erase').addEventListener('click', () => run(async () => {
  await call({type:'erase'}); state = await call({type:'get'}); render(); $('status').textContent = 'Exceptions et choix mémorisés effacés.';
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && state && changes[`tab-${state.tabId}`]) counts(changes[`tab-${state.tabId}`].newValue || {popups:0,overlays:0});
});
run(async () => { state = await call({type:'get'}); render(); });
