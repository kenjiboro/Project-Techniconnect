/* ==========================================================
   TechniConnect - shared UI helpers
   Save as: public/js/ui.js  (load BEFORE each page's own script)
   Pure presentation helpers: no network calls, no business logic.
   ========================================================== */
(function () {
  'use strict';

  // Escape text before putting it in innerHTML (prevents XSS)
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // "Maria Santos" -> "MS" (for avatar circles)
  function initials(first, last) {
    var a = String(first || '').trim().charAt(0);
    var b = String(last || '').trim().charAt(0);
    return (a + b).toUpperCase() || '?';
  }

  // Toast notification: one live region, announced by screen readers
  function notify(message, type) {
    type = type === 'error' ? 'error' : 'success';
    var region = document.getElementById('toastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toastRegion';
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    var el = document.createElement('div');
    el.className = 'flash ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    region.appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 6000 : 3500);
  }

  // Modal helpers: remember the trigger, move focus in, give it back on close
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function openModal(el, focusEl) {
    el._returnFocus = document.activeElement;
    el.classList.remove('hidden');
    document.body.classList.add('modal-open');
    var target = focusEl || el.querySelector(FOCUSABLE);
    if (target) target.focus();
  }

  function closeModalEl(el) {
    el.classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (el._returnFocus && el._returnFocus.focus) el._returnFocus.focus();
  }

  // Escape closes the open modal; Tab stays inside it
  document.addEventListener('keydown', function (e) {
    var open = document.querySelector('.modal-backdrop:not(.hidden)');
    if (!open) return;
    if (e.key === 'Escape') { closeModalEl(open); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(open.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Show/Hide password button (text, not emoji, so it is consistent and readable by screen readers)
  function bindPasswordToggle(buttonId, inputId) {
    var btn = document.getElementById(buttonId);
    var input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      var hide = input.type === 'password';
      input.type = hide ? 'text' : 'password';
      btn.textContent = hide ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', hide ? 'true' : 'false');
    });
  }

  window.escapeHtml = escapeHtml;
  window.initials = initials;
  window.notify = notify;
  window.openModal = openModal;
  window.closeModalEl = closeModalEl;
  window.bindPasswordToggle = bindPasswordToggle;
})();
