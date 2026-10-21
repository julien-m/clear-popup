export const defaults = Object.freeze({enabled: true, basic: true, advanced: true, exceptions: [], rules: {}});
export function normalize(raw = {}) {
  const result = {...defaults};
  for (const key of ['enabled', 'basic', 'advanced']) if (typeof raw?.[key] === 'boolean') result[key] = raw[key];
  result.exceptions = [...new Set((Array.isArray(raw?.exceptions) ? raw.exceptions : []).filter(validHost))].slice(0, 500);
  result.rules = Object.create(null);
  if (raw?.rules && typeof raw.rules === 'object') for (const [host, rules] of Object.entries(raw.rules).slice(0, 500)) {
    if (validHost(host) && Array.isArray(rules)) result.rules[host] = [...new Set(rules.filter(s => typeof s === 'string' && s.length > 0 && s.length <= 250))].slice(0, 50);
  }
  return result;
}
export function validHost(host) {
  if (typeof host !== 'string' || host.length > 253 || !host || /[\s/*?#:@]/.test(host)) return false;
  try { return new URL(`https://${host}`).hostname === host; } catch { return false; }
}
export function hostname(url) { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.hostname : ''; } catch { return ''; } }
