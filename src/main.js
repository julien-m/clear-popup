(() => {
  'use strict';
  // Original implementation. This world is shared with the page, not a security boundary.
  const nativeOpen = window.open;
  const nativeSubmit = HTMLFormElement.prototype.submit;
  let enabled = true;
  let lastGesture = -Infinity;
  let suspiciousGesture = false;
  const configEvent = 'clear-popup:config';
  const blockedEvent = 'clear-popup:blocked';
  const dispatch = window.dispatchEvent.bind(window);
  const now = performance.now.bind(performance);
  const style = window.getComputedStyle.bind(window);
  const activeGesture = () => navigator.userActivation.isActive && now() - lastGesture < 1000 && !suspiciousGesture;
  function fullScreenTrap(target) {
    if (!(target instanceof Element)) return false;
    const s = style(target), r = target.getBoundingClientRect();
    return ['fixed', 'absolute'].includes(s.position) && r.width >= innerWidth * .6 && r.height >= innerHeight * .75 && !target.closest('dialog,[role="dialog"],form,button,input,select,textarea');
  }
  for (const type of ['pointerdown', 'click', 'keydown']) window.addEventListener(type, event => {
    if (!event.isTrusted || event.repeat) return;
    if (event.composedPath().some(node => node instanceof Element && node.matches('[data-clear-popup-notice],[data-clear-popup-ui]'))) { lastGesture = -Infinity; return; }
    lastGesture = now(); suspiciousGesture = fullScreenTrap(event.composedPath()[0]);
  }, true);
  window.addEventListener(configEvent, event => {
    if (typeof event.detail?.enabled === 'boolean') enabled = event.detail.enabled;
  });
  function blocked() { dispatch(new CustomEvent(blockedEvent)); }
  function popupTarget(target) { return !!target && !['_self', '_top', '_parent'].includes(String(target).toLowerCase()); }
  window.open = function (...args) {
    const target = args[1] === undefined || args[1] === '' ? '_blank' : args[1];
    if (enabled && popupTarget(target) && !activeGesture()) { blocked(); return null; }
    return Reflect.apply(nativeOpen, window, args);
  };
  window.addEventListener('click', event => {
    const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (enabled && anchor && !anchor.hasAttribute('download') && popupTarget(anchor.target || document.querySelector('base[target]')?.target) && (!event.isTrusted || !activeGesture())) {
      event.preventDefault(); event.stopImmediatePropagation(); blocked();
    }
  }, true);
  function formTarget(form, submitter) {
    if (submitter?.hasAttribute('formtarget')) return submitter.formTarget;
    return form.target || document.querySelector('base[target]')?.target;
  }
  window.addEventListener('submit', event => {
    if (enabled && popupTarget(formTarget(event.target, event.submitter)) && !activeGesture()) { event.preventDefault(); event.stopImmediatePropagation(); blocked(); }
  }, true);
  HTMLFormElement.prototype.submit = function (...args) {
    if (enabled && popupTarget(formTarget(this)) && !activeGesture()) { blocked(); return; }
    return Reflect.apply(nativeSubmit, this, args);
  };
  dispatch(new CustomEvent('clear-popup:ready'));
})();
