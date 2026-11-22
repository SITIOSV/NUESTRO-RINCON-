/* Modal de carga compartido: bloquea los clics mientras el servidor responde y dice qué está pasando. */
(function () {
  'use strict';
  if (window.HBusy) return;
  var n = 0, showT = null, slowT = null, shownAt = 0, hideT = null, el = null, msgEl = null, hintEl = null;
  var css = '#hb-busy{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(9,5,10,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font-family:Montserrat,system-ui,sans-serif;cursor:progress}' +
    '#hb-busy.on{display:flex}' +
    '#hb-busy .bx{display:flex;flex-direction:column;align-items:center;gap:.7rem;text-align:center;background:#1a0a12;color:#FFF5E9;border:1px solid rgba(212,175,55,.5);border-radius:16px;padding:1.4rem 1.6rem;width:min(88vw,320px);box-shadow:0 14px 50px rgba(0,0,0,.6)}' +
    '#hb-busy .sp{width:40px;height:40px;border-radius:50%;border:3px solid rgba(212,175,55,.22);border-top-color:#F7E29C;animation:hbspin .9s linear infinite}' +
    '#hb-busy .m{font-size:1rem;font-weight:600;color:#F7E29C;line-height:1.35}' +
    '#hb-busy .h{font-size:.78rem;color:rgba(255,245,233,.7);line-height:1.4;min-height:1.1em}' +
    '@keyframes hbspin{to{transform:rotate(360deg)}}';
  function build() {
    if (el) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'hb-busy'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-label', 'Cargando');
    el.innerHTML = '<div class="bx"><div class="sp" aria-hidden="true"></div><div class="m"></div><div class="h"></div></div>';
    document.body.appendChild(el); msgEl = el.querySelector('.m'); hintEl = el.querySelector('.h');
  }
  function on(msg) {
    build(); n++;
    msgEl.textContent = msg || 'Un momento…'; hintEl.textContent = '';
    clearTimeout(hideT);
    if (n === 1 && !el.classList.contains('on')) {
      clearTimeout(showT); showT = setTimeout(function () { el.classList.add('on'); shownAt = Date.now(); }, 150);
      clearTimeout(slowT); slowT = setTimeout(function () { if (hintEl) hintEl.textContent = 'Google a veces tarda unos segundos. No cierres la página 💌'; }, 6000);
    }
  }
  function off() {
    if (!el) return; n = Math.max(0, n - 1);
    if (n > 0) return;
    clearTimeout(showT); clearTimeout(slowT);
    if (!el.classList.contains('on')) return;
    var wait = Math.max(0, 350 - (Date.now() - shownAt));   // que no parpadee si fue muy rápido
    hideT = setTimeout(function () { if (n === 0) el.classList.remove('on'); }, wait);
  }
  /* run('Guardando…', () => promesa) → muestra el modal mientras la promesa está pendiente */
  function run(msg, fn) {
    on(msg);
    var p; try { p = Promise.resolve(fn()); } catch (e) { off(); return Promise.reject(e); }
    return p.then(function (v) { off(); return v; }, function (e) { off(); throw e; });
  }
  window.HBusy = { on: on, off: off, run: run, active: function () { return n > 0; } };
})();
