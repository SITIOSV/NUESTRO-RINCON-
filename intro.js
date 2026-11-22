/* Animación de entrada: el calendario en perspectiva. Se reproduce una vez por sesión. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MONTHS_UP = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const S = { introActive: true };
  const EXP = () => null;
  function fallbackToday() {
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
      return Date.UTC(p[0], p[1] - 1, p[2]);
    } catch (e) { const d = new Date(Date.now() - 6 * 3600 * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  }
  const startUTC = () => Date.UTC(2026, 10, 11);
  const lastUTC = () => Date.UTC(2026, 11, 12);
  const todayUTC = () => fallbackToday();

  let sharedTickCtx = null;   // un solo AudioContext para los "clip" (la simulación repite la intro varias veces)
  function runIntro(forUTC) {
    // las medidas del calendario dependen de las tipografías: se espera a que carguen (máx. 1.8 s)
    const fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]) : Promise.resolve();
    return fontsReady.catch(() => {}).then(() => runIntroCore(forUTC));
  }
  function runIntroCore(forUTC) {
    const root = $('intro-cal'), sheet = $('cal-sheet'), rig = $('cal-rig'), flash = $('cal-flash');
    if (!root || !sheet || !rig) { S.introActive = false; return Promise.resolve(); }

    const t = Math.max(startUTC(), Math.min(lastUTC(), forUTC == null ? todayUTC() : forUTC));
    // --- calendario del MES COMPLETO de la fecha: noviembre (1 al 30) hasta el 30/11; diciembre solo desde el 1/12 ---
    const td = new Date(t), mY = td.getUTCFullYear(), mM = td.getUTCMonth();
    const monthStart = Date.UTC(mY, mM, 1);
    const daysInMonth = new Date(Date.UTC(mY, mM + 1, 0)).getUTCDate();
    const title = document.createElement('div'); title.className = 'cal-month';
    title.textContent = MONTHS_UP[mM] + ' ' + mY;
    const grid = document.createElement('div'); grid.className = 'cal-days';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((x) => { const e = document.createElement('div'); e.className = 'cal-dow-i'; e.textContent = x; grid.appendChild(e); });
    const offset = (new Date(monthStart).getUTCDay() + 6) % 7;
    for (let k = 0; k < offset; k++) { const e = document.createElement('div'); e.className = 'cal-cell empty'; grid.appendChild(e); }
    let targetEl = null;
    const dayCells = [];      // solo los días que se van sombreando (desde el 11/11 hasta antes de hoy), en orden
    for (let d = 1; d <= daysInMonth; d++) {
      const u = Date.UTC(mY, mM, d);
      const c = document.createElement('div'); c.className = 'cal-cell';
      if (u < startUTC() || u > lastUTC()) c.classList.add('out');           // días del mes fuera del recorrido (se ven, pero apagados)
      if (u === startUTC() || u === lastUTC()) c.classList.add('mark');
      if (u === t) { c.classList.add('target'); targetEl = c; }
      else if (u >= startUTC() && u < t) dayCells.push(c);
      const s = document.createElement('span'); s.textContent = d; c.appendChild(s);
      grid.appendChild(c);
    }
    const tIdx = dayCells.length;     // cuántos días se sombrean antes de llegar a hoy
    sheet.appendChild(title); sheet.appendChild(grid);

    // --- medidas: el centro de la fecha queda en el origen de la cámara ---
    const W = sheet.offsetWidth, H = sheet.offsetHeight;
    // posición de la fecha DENTRO de la hoja (el offsetParent de la celda es la cuadrícula, no la hoja: se suman los niveles)
    let ox = 0, oy = 0, nd = targetEl;
    while (nd && nd !== sheet) { ox += nd.offsetLeft; oy += nd.offsetTop; nd = nd.offsetParent; }
    const cx = ox + targetEl.offsetWidth / 2;
    const cy = oy + targetEl.offsetHeight / 2;
    const C = targetEl.offsetWidth;
    sheet.style.left = (-cx) + 'px';
    sheet.style.top = (-cy) + 'px';

    let finished = false, timers = [], anims = [], resolveFn;
    const done = new Promise((r) => { resolveFn = r; });

    function leave(quick) {
      if (finished) return; finished = true;
      timers.forEach(clearTimeout); anims.forEach((a) => { try { a.pause(); } catch (e) {} });
      if (flash && flash.animate && !RM) { flash.animate([{ opacity: 0 }, { opacity: quick ? 0.55 : 0.95, offset: 0.4 }, { opacity: 0 }], { duration: quick ? 500 : 1000 }); }
      timers = [
        setTimeout(() => root.classList.add('leaving'), quick ? 60 : 380),
        setTimeout(() => { root.classList.add('gone'); S.introActive = false; resolveFn(); }, quick ? 900 : 1700)
      ];
    }
    $('intro-skip').addEventListener('click', () => leave(true));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !finished) leave(true); });

    // "clip, clip, clip": cada día se sombrea con un tic hasta llegar a la fecha de hoy
    let tickCtx = sharedTickCtx;
    if (!tickCtx) { try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) tickCtx = sharedTickCtx = new AC(); } catch (e) {} }
    const wake = () => { if (tickCtx && tickCtx.state === 'suspended') { try { tickCtx.resume(); } catch (e) {} } };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { once: true, passive: true }));
    const clip = (final) => {
      if (!tickCtx || tickCtx.state !== 'running') return;
      try {
        const now = tickCtx.currentTime, o = tickCtx.createOscillator(), g = tickCtx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(final ? 760 : 1500, now); o.frequency.exponentialRampToValueAtTime(final ? 520 : 700, now + 0.05);
        g.gain.setValueAtTime(final ? 0.07 : 0.045, now); g.gain.exponentialRampToValueAtTime(0.0001, now + (final ? 0.22 : 0.07));
        o.connect(g); g.connect(tickCtx.destination); o.start(now); o.stop(now + 0.25);
      } catch (e) {}
    };

    if (RM || !rig.animate) {
      // movimiento reducido: sin cámara, pero SÍ se ve el sombreado día a día, el clip y la fecha iluminada
      const s = Math.min(innerWidth * 0.88 / W, innerHeight * 0.82 / H, 1.4);
      rig.style.transform = 'scale(' + s + ')';
      const g0 = 1200, gp = 620;
      for (let i = 0; i < tIdx; i++) timers.push(setTimeout(() => { if (finished) return; dayCells[i].classList.add('past'); clip(false); }, g0 + i * gp));
      const tEnd = g0 + tIdx * gp + 300;
      timers.push(setTimeout(() => { if (finished) return; clip(true); rig.classList.add('lit'); const E = EXP(); if (E && E.chime) { try { E.chime(); } catch (e) {} } }, tEnd));
      timers.push(setTimeout(() => leave(false), tEnd + 2600));
      return done;
    }

    // --- recorrido de la cámara ---
    const dur = 7500;

    const count = tIdx;                                    // días desde el 11/11 hasta antes de hoy
    const startAt = 1100, span = dur * 0.56 - startAt;     // ventana donde ocurren los clips
    const gap = count > 0 ? Math.max(110, Math.min(520, span / count)) : 0;
    for (let i = 0; i < count; i++) {
      timers.push(setTimeout(() => { if (finished) return; dayCells[i].classList.add('past'); clip(false); }, startAt + i * gap));
    }
    timers.push(setTimeout(() => { if (!finished) clip(true); }, startAt + count * gap + 80));

    const tf = (px, py, rx, rz, sc) => 'rotateX(' + rx + 'deg) rotateZ(' + rz + 'deg) scale3d(' + sc + ',' + sc + ',' + sc + ') translate3d(' + (cx - px) + 'px,' + (cy - py) + 'px,0)';
    const k = Math.min(innerWidth * 0.92 / W, innerHeight * 0.82 / H);   // escala que hace caber el mes entero
    const fill = Math.min(3.6, Math.max(innerWidth, innerHeight) / C * 1.3);  // acercamiento final (tope para no pixelar)
    const portrait = innerHeight > innerWidth;                 // teléfono en vertical: más margen y menos inclinación
    const ease = 'cubic-bezier(.45,.05,.25,1)';
    // La cámara va del plano general del mes directo hacia el número (sin pasar por un punto desplazado ni ladearse):
    // el foco avanza en línea recta del centro del mes a la fecha, y el giro lateral se reduce a 0 de forma continua.
    const ovX = W * 0.5, ovY = H * (portrait ? 0.46 : 0.30);
    const along = (f) => ({ x: ovX + (cx - ovX) * f, y: ovY + (cy - ovY) * f });
    const p1 = along(0.6), p2 = along(0.93);   // el desplazamiento va un poco por delante del zoom (así el número nunca se aleja del centro)
    const frames = [
      { transform: tf(ovX, ovY, portrait ? 56 : 66, 0, k * (portrait ? 0.78 : 1.08)), easing: ease, offset: 0 },
      { transform: tf(p1.x, p1.y, portrait ? 52 : 59, 0, k * (portrait ? 1.2 : 1.45)), easing: ease, offset: 0.42 },
      { transform: tf(p2.x, p2.y, 46, 0, Math.max(k * 2.3, 1.3)), easing: ease, offset: 0.68 },
      { transform: tf(cx, cy, 22, 0, Math.max(k * 3.6, 2.3)), easing: 'cubic-bezier(.5,0,.2,1)', offset: 0.86 },
      { transform: tf(cx, cy, 0, 0, fill), offset: 1 }
    ];
    anims.push(rig.animate(frames, { duration: dur, fill: 'forwards' }));
    const fade = $('cal-fade'); if (fade) anims.push(fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1400, fill: 'forwards', easing: 'ease-out' }));
    timers.push(setTimeout(() => rig.classList.add('lit'), dur * 0.66));
    timers.push(setTimeout(() => { const E = EXP(); if (E && E.chime) { try { E.chime(); } catch (e) {} } }, dur * 0.88));
    timers.push(setTimeout(() => leave(false), dur - 150));
    return done;
  }


  const root = $('intro-cal');
  let visto = false; try { visto = sessionStorage.getItem('intro_visto') === '1'; } catch (e) {}
  if (!root) return;
  if (visto) { root.classList.add('gone'); return; }          // al volver al Inicio dentro de la misma visita no se repite
  runIntro().catch(() => { root.classList.add('gone'); }).then(() => { try { sessionStorage.setItem('intro_visto', '1'); } catch (e) {} });
})();
