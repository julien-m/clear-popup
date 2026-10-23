(() => {
  'use strict';
  // This ISOLATED-world bootstrap is registered only for protected origins.
  // It lets heuristics run before asynchronous storage returns, without touching
  // sites that have an exception or users who disabled advanced protection.
  globalThis.clearPopupAdvancedStart = true;
  window.dispatchEvent(new Event('clear-popup:advanced-ready'));
})();
