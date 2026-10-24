/* SPDX-License-Identifier: MIT */
(() => {
  const api = globalThis.browser?.i18n ?? globalThis.chrome?.i18n;
  if (!api) throw new Error('Extension i18n API unavailable');
  const attributes = ['title', 'placeholder', 'aria-label', 'alt'];
  function message(key, substitutions) {
    const value = api.getMessage(key, substitutions);
    if (value) return value;
    console.warn(`Missing extension translation: ${key}`);
    return key;
  }
  function render(root) {
    const selector = ['[data-i18n]', ...attributes.map(a => `[data-i18n-${a}]`)].join(',');
    const nodes = [...root.querySelectorAll(selector)];
    if (root.matches?.(selector)) nodes.unshift(root);
    for (const node of nodes) {
      const key = node.getAttribute('data-i18n');
      if (key) {
        if (node.children.length) throw new Error('data-i18n requires a text-only leaf');
        node.textContent = message(key);
      }
      for (const attribute of attributes) {
        const attributeKey = node.getAttribute(`data-i18n-${attribute}`);
        if (attributeKey) node.setAttribute(attribute, message(attributeKey));
      }
    }
  }
  // Pass an extension document element or the extension's own shadow-root host.
  // Never pass the visited page's document element from a content script.
  function setLocale(element) {
    element.setAttribute('lang', api.getUILanguage().replaceAll('_', '-'));
    element.setAttribute('dir', api.getMessage('@@bidi_dir') === 'rtl' ? 'rtl' : 'ltr');
  }
  globalThis.ExtensionI18n = Object.freeze({ message, render, setLocale });
})();
