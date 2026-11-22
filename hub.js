(() => {
  'use strict';
  /* =====================================================================
     HUB · menú, inicio, fotos, lugares, favoritos y línea de tiempo
     ---------------------------------------------------------------------
     AGREGAR FOTOS: pon los archivos en la carpeta /fotos del repositorio y
     escribe sus nombres aquí, separados por coma. Luego, en modo admin
     (Ctrl/Cmd+clic sobre el título del menú), edita cada foto.
  ===================================================================== */
  const FOTOS_DIR = 'fotos/';
  const FOTOS_ARCHIVOS = ``;   // ej.: foto1.jpg, foto2.png, foto3.jpg
  const HOME_ORDER = ['cartas', 'fechas', 'juntos', 'aniversarios'];   // orden de importancia en Inicio
  const URL_API = 'https://script.google.com/macros/s/AKfycbzim9NIUvePX36k1ejl9iBMWE8pl_A9PJi4XyF6OlsGNWv8XNpnMDrqFRkb0utQ9dxhPg/exec';
  const TZ_OFF = -6 * 3600 * 1000;      // America/El_Salvador (sin horario de verano)
  const LS = 'hub_v1';
  const HOME_AVISO_DIAS = 3;   // en Inicio, fechas y aniversarios aparecen solo cuando faltan hasta N días (y el propio día)
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const pl = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  function fmtDate(s) { const p = String(s || '').split('-').map(Number); return p.length === 3 && p[0] ? p[2] + ' de ' + MES[p[1] - 1] + ' de ' + p[0] : ''; }
  function nowSV() { return new Date(Date.now() + TZ_OFF); }                    // getters UTC = hora local de El Salvador
  function todayStr() { const d = nowSV(); return ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

  /* ---------------- Datos ---------------- */
  const D0 = { fecha_inicio: '', categorias: [], lugares: [], fotos: [], favoritos: [], favoritos_cartas: [], fechas: [], notas: [], aniversarios_correo: true, correo_ella_edita: true, dias_antes: 1 };
  let D = Object.assign({}, D0);
  let loaded = false, offline = false;
  try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && c.ok) { D = Object.assign({}, D0, c); } } catch (e) {}
  /* fotos/lista.json lo genera el archivo ACTUALIZAR_FOTOS.bat (lista de foto1.jpg, foto2.png…). Si no existe, no pasa nada. */
  let LISTA = [];
  const okName = (x) => /^[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/i.test(x);
  function loadLista() {
    return fetch(FOTOS_DIR + 'lista.json', { cache: 'no-cache', credentials: 'omit' }).then((r) => (r.ok ? r.json() : [])).then((j) => { const a = Array.isArray(j) ? j : (j && Array.isArray(j.fotos) ? j.fotos : []); LISTA = a.filter((x) => typeof x === 'string' && okName(x)); }).catch(() => {});
  }
  const codeFiles = () => FOTOS_ARCHIVOS.split(',').map((x) => x.trim()).filter(Boolean).concat(LISTA.filter((x) => FOTOS_ARCHIVOS.indexOf(x) < 0));
  function photos() {
    const meta = {}; D.fotos.forEach((f) => { meta[f.archivo] = f; });
    const names = codeFiles(); D.fotos.forEach((f) => { if (names.indexOf(f.archivo) < 0) names.push(f.archivo); });
    return names.map((a) => Object.assign({ archivo: a, lugar_id: '', fecha: '', categorias: [], nota: '' }, meta[a] || {}));
  }
  const favSet = () => new Set(D.favoritos);
  const lugarById = (id) => D.lugares.find((l) => l.id === id);
  const PIX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const driveCache = {}, driveBusy = {};
  const thumbSrc = (p) => (p.miniatura ? src('drive_' + p.miniatura) : src(p.archivo));
  const src = (a) => (/^drive_/.test(a) ? (driveCache[a.slice(6)] || PIX + '#' + a) : FOTOS_DIR + encodeURIComponent(a));
  async function hydrate() {
    const imgs = Array.from(document.querySelectorAll('#hub img, #hb-viewer img')).filter((im) => /#drive_/.test(im.getAttribute('src') || ''));
    for (const im of imgs) {
      const id = im.getAttribute('src').split('#drive_')[1]; if (!id || driveBusy[id]) continue;
      if (driveCache[id]) { im.src = driveCache[id]; continue; }
      driveBusy[id] = true;
      api('GET', { action: 'foto_drive', id }).then((j) => { if (j && j.ok && j.data) { driveCache[id] = j.data; document.querySelectorAll('#hub img, #hb-viewer img').forEach((x) => { if ((x.getAttribute('src') || '').endsWith('#drive_' + id)) x.src = j.data; }); } }).catch(() => {}).finally(() => { driveBusy[id] = false; });
    }
  }
  let hyT = null; const queueHydrate = () => { clearTimeout(hyT); hyT = setTimeout(hydrate, 120); };

  /* Textos del modal de carga según la acción (todo lo que el usuario inicia bloquea la pantalla con un mensaje). */
  const BUSY_TXT = { admin_entrar: 'Verificando la clave…', correo_set: 'Guardando tu correo…', correos_leer: 'Leyendo los correos…', correos_guardar: 'Guardando correos…', correo_prueba: 'Enviando el correo de prueba…', recordatorios_activar: 'Activando los avisos diarios…', config_guardar: 'Guardando…', foto_subir: 'Subiendo la foto… no cierres la página', foto_guardar: 'Guardando la foto…', foto_borrar: 'Borrando la foto…', foto_drive_admin: 'Cargando la foto…', lugar_guardar: 'Guardando el lugar…', lugar_borrar: 'Borrando el lugar…', categoria_agregar: 'Agregando la categoría…', fecha_guardar: 'Guardando la fecha…', fecha_borrar: 'Borrando la fecha…', carta_leer: 'Abriendo la carta…', carta_guardar: 'Guardando la carta…', cartas_importar: 'Importando cartas…', carta_dia: 'Abriendo tu carta…', pend_listar: 'Buscando pendientes…', pend_aprobar: 'Aprobando…', pend_rechazar: 'Rechazando…', pend_nota: 'Enviando tu recuerdo…', pend_foto: 'Enviando tu foto…', bloqueo_set: 'Aplicando el bloqueo…', start_site: 'Reactivando el sitio…', stop_site: 'Bloqueando el sitio…', estado: 'Leyendo el estado…' };
  const QUIET = { fav: 1, foto_drive: 1 };            // se pintan al instante o van en segundo plano
  const BUSY_GET = { carta_dia: 1 };                  // lecturas que sí inicia el usuario con un clic
  async function api(method, params, body, opt) {
    const act = (body && body.action) || (params && params.action) || '';
    const wantBusy = opt && opt.busy === false ? false : (opt && typeof opt.busy === 'string') || (method === 'POST' ? !QUIET[act] : !!BUSY_GET[act]);
    const txt = (opt && typeof opt.busy === 'string') ? opt.busy : (BUSY_TXT[act] || 'Guardando…');
    if (wantBusy && window.HBusy) window.HBusy.on(txt);
    try { return await api0(method, params, body, act); } finally { if (wantBusy && window.HBusy) window.HBusy.off(); }
  }
  async function api0(method, params, body, act) {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), method === 'POST' ? (act === 'foto_subir' || act === 'pend_foto' || act === 'cartas_importar' ? 70000 : 35000) : 20000);
    try {
      let url = URL_API; const init = { method, signal: ctrl.signal, redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
      if (method === 'GET') url += '?' + new URLSearchParams(Object.assign({ _: Date.now() }, params)).toString();
      else { init.headers = { 'Content-Type': 'text/plain;charset=utf-8' }; init.body = JSON.stringify(body); }
      const res = await fetch(url, init); if (!res.ok) throw new Error('http');
      return await res.json();
    } finally { clearTimeout(to); }
  }
  async function load() {
    try {
      const j = await api('GET', { action: 'hub' });
      if (j && j.ok === true && Array.isArray(j.fotos)) { D = Object.assign({}, D0, j); loaded = true; offline = false; try { localStorage.setItem(LS, JSON.stringify(j)); } catch (e) {} }
      else offline = true;
    } catch (e) { offline = true; }
  }

  /* ---------------- Estado de la interfaz ---------------- */
  const PAGE = (document.body && document.body.dataset.page) || 'home';
  const P = new URLSearchParams(location.search);
  const ss = (k) => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const ssSet = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} };
  let cur = PAGE, admin = ss('hb_admin') === '1', adminKey = ss('hb_key');
  const F = { desde: '', hasta: '', lugar: '', cat: '', fav: false };
  let fotosTab = 'album', lugaresTab = 'cal', selLugar = '', pick = null, map = null, markers = {}, tick = null;
  if (PAGE === 'fotos') { if (P.get('tab') === 'cal' || P.get('tab') === 'album') fotosTab = P.get('tab'); if (P.get('lugar')) F.lugar = P.get('lugar'); }
  if (PAGE === 'lugares') { if (P.get('tab') === 'cal' || P.get('tab') === 'mapa') lugaresTab = P.get('tab'); if (P.get('lugar')) selLugar = P.get('lugar'); }
  const view = () => $('hb-view');

  /* ---------------- Calendario ---------------- */
  function calendar(host, marks, onPick, opts) {
    opts = opts || {};
    const t = nowSV(); let y = opts.y || t.getUTCFullYear(), m = opts.m != null ? opts.m : t.getUTCMonth(), sel = '';
    function draw() {
      const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7, n = dim(y, m);
      let h = '<div class="hb-cal-head"><button class="hb-ib" data-d="-1" aria-label="Mes anterior">‹</button><b>' + MES[m] + ' ' + y + '</b><button class="hb-ib" data-d="1" aria-label="Mes siguiente">›</button></div><div class="hb-cal">';
      DOW.forEach((d) => { h += '<div class="dw">' + d + '</div>'; });
      for (let i = 0; i < first; i++) h += '<button class="blank" tabindex="-1" aria-hidden="true"></button>';
      for (let d = 1; d <= n; d++) {
        const k = ymd(y, m, d), mk = typeof marks === 'function' ? marks(k) : marks[k];
        h += '<button type="button" data-k="' + k + '" class="' + (mk === '🔒' ? 'lock ' : mk ? 'has ' : '') + (k === todayStr() ? 'today ' : '') + (k === sel ? 'sel' : '') + '"' + (mk ? ' data-i="' + esc(mk) + '" aria-label="' + d + ' de ' + MES[m] + ': hay recuerdos"' : '') + '>' + d + '</button>';
      }
      host.innerHTML = h + '</div>';
      host.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { m += Number(b.dataset.d); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); }));
      host.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.k; draw(); onPick(sel); }));
    }
    draw();
  }

  /* ---------------- Tiempo juntos y aniversarios ---------------- */
  function startParts() { return isDate(D.fecha_inicio) ? D.fecha_inicio.split('-').map(Number) : null; }
  function diffNow() {
    const sp = startParts(); if (!sp) return null;
    const a = new Date(Date.UTC(sp[0], sp[1] - 1, sp[2])), b = nowSV();
    if (b < a) return { fut: true };
    let y = b.getUTCFullYear() - a.getUTCFullYear(), mo = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
    let h = b.getUTCHours(), mi = b.getUTCMinutes(), s = b.getUTCSeconds();
    if (d < 0) { d += dim(b.getUTCFullYear(), b.getUTCMonth() - 1 < 0 ? 11 : b.getUTCMonth() - 1) ; mo--; }
    if (mo < 0) { mo += 12; y--; }
    return { y, mo, d, h, mi, s, total: Math.floor((b - a) / 86400000) };
  }
  function annivDate(n) {   // aniversario número n (en meses)
    const sp = startParts(); const tm = sp[1] - 1 + n, y = sp[0] + Math.floor(tm / 12), m = ((tm % 12) + 12) % 12;
    return ymd(y, m, Math.min(sp[2], dim(y, m)));
  }
  const annivLabel = (n) => (n % 12 === 0 ? pl(n / 12, 'año', 'años') : pl(n, 'mes', 'meses'));
  function daysTo(k) { const p = k.split('-').map(Number), t = todayStr().split('-').map(Number); return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(t[0], t[1] - 1, t[2])) / 86400000); }
  function nextAnniv(count) {
    if (!startParts()) return [];
    const out = []; let n = 1;
    while (out.length < count && n < 2400) { const k = annivDate(n); if (daysTo(k) >= 0) out.push({ n, k, dias: daysTo(k), label: annivLabel(n) }); n++; }
    return out;
  }
  function pastAnniv() {
    if (!startParts()) return []; const out = []; for (let n = 1; n < 2400; n++) { const k = annivDate(n); if (daysTo(k) > 0) break; out.push({ n, k, label: annivLabel(n) }); } return out;
  }

  /* ---------------- Modal y clave de admin ---------------- */
  function modal(html) { const m = $('hb-modal'); m.innerHTML = '<div class="mbox">' + html + '</div>'; m.classList.add('on'); return m; }
  function closeModal() { const m = $('hb-modal'); m.classList.remove('on'); m.innerHTML = ''; }
  function askKey() {
    if (adminKey) return Promise.resolve(adminKey);
    return new Promise((res) => {
      const m = modal('<h3>Clave de administrador</h3><input class="hb-in" id="hb-k" type="password" autocomplete="off" aria-label="Clave"><div class="err" id="hb-ke"></div><div class="row"><button class="hb-btn ghost" id="hb-kc" type="button">Cancelar</button><button class="hb-btn" id="hb-ko" type="button">Aceptar</button></div>');
      const k = $('hb-k'); k.focus();
      const ok = () => { if (!k.value) return; adminKey = k.value; ssSet('hb_key', adminKey); closeModal(); res(adminKey); };
      $('hb-ko').onclick = ok; k.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      $('hb-kc').onclick = () => { closeModal(); res(''); };
    });
  }
  const ERR = { clave: 'Clave incorrecta.', bloqueado: 'Demasiados intentos. Espera unos minutos.', 'sin-clave': 'El servidor no tiene clave configurada.', ocupado: 'El servidor está ocupado, intenta otra vez.', fecha: 'Fecha no válida.', datos: 'Datos no válidos.', correo: 'Correo no válido.', limite: 'Demasiados envíos, intenta más tarde.', lleno: 'Hay demasiados pendientes por aprobar.', tamano: 'La foto es demasiado grande.', tipo: 'Formato de foto no válido.', no: 'No disponible.' };
  async function adminPost(action, data) {
    const clave = await askKey(); if (!clave) return { ok: false, error: 'cancel' };
    try {
      const j = await api('POST', null, Object.assign({ action, clave }, data));
      if (j && j.error === 'clave') { adminKey = ''; ssSet('hb_key', ''); }
      return j || { ok: false, error: 'red' };
    } catch (e) { return { ok: false, error: 'red' }; }
  }
  const errTxt = (j) => ERR[j && j.error] || 'No se pudo guardar. Revisa tu conexión.';
  const toast = (t) => { const el = $('r12-toast'); if (!el) return; el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };

  /* ---------------- Navegación entre páginas ---------------- */
  const PAGES = [['home', 'index.html', '🏠', 'Inicio'], ['regalo', 'regalo.html', '🎁', 'Regalo y calendario'], ['lugares', 'lugares.html', '📍', 'Lugares visitados'], ['fotos', 'fotos.html', '🖼️', 'Fotos'], ['fechas', 'fechas.html', '📅', 'Fechas importantes'], ['cartas', 'cartas.html', '✉️', 'Cartas diarias'], ['linea', 'linea.html', '⏳', 'Línea de tiempo'], ['favoritos', 'favoritos.html', '♥', 'Favoritos'], ['pend', 'pendientes.html', '📥', 'Pendientes', 'adm']];
  const pageUrl = (n) => (PAGES.find((x) => x[0] === n) || PAGES[0])[1];
  function buildNav() {
    $('hb-nav').innerHTML = PAGES.map((p) => '<a href="' + p[1] + '" class="' + (p[4] ? 'adm-only ' : '') + (p[0] === PAGE ? 'cur' : '') + '"><span>' + p[2] + '</span>' + p[3] + '</a>').join('') + '<a role="button" tabindex="0" id="hb-nav-help"><span>🛠</span>Admin</a>';
    const h = $('hb-nav-help'), go = () => onAdminMenu();
    h.addEventListener('click', go); h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  function toggleNav(on) { $('hb-nav').classList.toggle('on', on); $('hb-scrim').classList.toggle('on', on); $('hb-burger').setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function closeHub() { location.href = 'regalo.html'; }
  /* Cambia de sección: si es la página actual solo se redibuja; si no, se abre su propio HTML. */
  function goto(name) {
    if (name === cur) { render(); return; }
    let qs = '';
    if (name === 'fotos') qs = '?' + new URLSearchParams({ lugar: F.lugar || '', tab: fotosTab });
    else if (name === 'lugares') qs = '?' + new URLSearchParams({ lugar: selLugar || '', tab: lugaresTab });
    location.href = pageUrl(name) + qs;
  }
  function render() {
    clearInterval(tick); if (map) { try { map.remove(); } catch (e) {} map = null; markers = {}; }
    const s = PAGES.find((x) => x[0] === cur); $('hb-title').textContent = s ? s[3] : 'Inicio';
    document.title = (s ? s[3] + ' · ' : '') + 'Nuestro rincón';
    const v = view(); v.innerHTML = '<div class="hb-wrap" id="hb-w"></div>';
    ({ home: vHome, lugares: vLugares, fotos: vFotos, fechas: vFechas, cartas: vCartas, linea: vLinea, favoritos: vFavoritos, pend: vPend })[cur]();
    v.scrollTop = 0;
  }
  const W = () => $('hb-w');
  const rerender = () => { const st = view().scrollTop; render(); view().scrollTop = st; };

  /* ---------------- INICIO ---------------- */
  function vHome() {
    const w = W();
    const cards = {
      cartas: () => {
        const hoy = hoyCartas(), t = dispCartas().find((x) => x.fecha === hoy);
        if (!t) return '';
        return '<div class="hb-card"><h3>💌 Carta de hoy</h3><p><b>' + esc(t.titulo || 'Para ti') + '</b></p><button class="hb-btn" data-act="carta" type="button">Leer la carta de hoy</button> <button class="hb-btn ghost" data-go="cartas" type="button">Ver todas</button></div>';
      },
      fechas: () => {
        const n = upcoming(40).filter((a) => a.tipo === 'f' && a.dias <= HOME_AVISO_DIAS).slice(0, 3);
        if (!n.length) return '';
        return '<div class="hb-card"><h3>📅 Fechas importantes</h3>' + n.map((a) => '<p><b>' + esc(a.titulo) + '</b> · ' + fmtDate(a.k) + ' · ' + cuando(a.dias) + '</p>').join('') + '<button class="hb-btn ghost" data-go="fechas" type="button">Ver fechas</button></div>';
      },
      juntos: () => '<div class="hb-card" id="hb-juntos"></div>',
      aniversarios: () => {
        if (!startParts()) return '';
        const n = nextAnniv(1)[0], p = pastAnniv(), last = p[p.length - 1];
        if (last && last.k === todayStr()) return '<div class="hb-card"><h3>🎂 Aniversario</h3><div class="hb-big">🎉 ¡Hoy cumplimos ' + esc(last.label) + '!</div><p>Gracias por cada día. Te amo.</p></div>';
        if (n && n.dias <= HOME_AVISO_DIAS) return '<div class="hb-card"><h3>🎂 Aniversario</h3><div class="hb-big">' + esc(n.label) + ' juntos</div><p>' + fmtDate(n.k) + ' · ' + cuando(n.dias) + '</p></div>';
        return '';
      }
    };
    w.innerHTML = (offline && !loaded ? '<p class="hb-small" style="margin-bottom:.6rem">Sin conexión · mostrando lo último guardado.</p>' : '') + HOME_ORDER.map((k) => (cards[k] ? cards[k]() : '')).join('') + recuerdoCard() + '<div class="hb-card"><h3>Ir a…</h3><div class="hb-links">' + PAGES.filter((p) => p[0] !== 'home' && !p[4]).map((p) => '<a class="hb-btn ghost" href="' + p[1] + '">' + p[2] + ' ' + p[3] + '</a>').join('') + '</div></div><div class="hb-card"><h3>＋ Un recuerdo tuyo</h3><p>¿Una nota o una foto que quieras agregar a nuestro rincón?</p><button class="hb-btn" data-act="add" type="button">Agregar un recuerdo</button></div>';
    w.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.go)));
    w.querySelectorAll('[data-act="regalo"]').forEach((b) => b.addEventListener('click', closeHub));
    w.querySelectorAll('[data-act="carta"]').forEach((b) => b.addEventListener('click', () => openCarta(hoyCartas())));
    w.querySelectorAll('[data-act="add"]').forEach((b) => b.addEventListener('click', addRecuerdo));
    bindRecuerdo(w);
    const j = $('hb-juntos'); if (j) { paintJuntos(j); tick = setInterval(() => paintJuntos(j), 1000); }
  }
  function paintJuntos(el) {
    const d = diffNow(); let h = '<h3>⏳ Días juntos</h3>';
    if (!d) h += '<p>Falta la fecha en la que empezamos.</p>';
    else if (d.fut) h += '<p>Nuestra historia empieza pronto…</p>';
    else h += '<div class="hb-big">Llevamos ' + [d.y ? pl(d.y, 'año', 'años') : '', d.mo ? pl(d.mo, 'mes', 'meses') : '', pl(d.d, 'día', 'días')].filter(Boolean).join(', ') + '</div><p>' + pl(d.h, 'hora', 'horas') + ', ' + pl(d.mi, 'minuto', 'minutos') + ' y ' + pl(d.s, 'segundo', 'segundos') + '</p><p class="hb-small">' + d.total.toLocaleString('es') + ' días en total</p>';
    h += '<button class="hb-btn ghost hb-adm" id="hb-fi" type="button">✎ Fecha de inicio</button>';
    if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; const b = $('hb-fi'); if (b) b.onclick = editInicio; }
  }
  function editInicio() {
    modal('<h3>Fecha en que empezamos</h3><input class="hb-in" id="hb-fd" type="date" value="' + esc(D.fecha_inicio) + '" aria-label="Fecha de inicio"><div class="err" id="hb-fe"></div><div class="row"><button class="hb-btn ghost" id="hb-fc" type="button">Cancelar</button><button class="hb-btn" id="hb-fg" type="button">Guardar</button></div>');
    $('hb-fc').onclick = closeModal;
    $('hb-fg').onclick = async () => {
      const v = $('hb-fd').value; if (!isDate(v)) { $('hb-fe').textContent = 'Elige una fecha.'; return; }
      closeModal(); const j = await adminPost('config_guardar', { fecha_inicio: v });
      if (j.ok) { await load(); rerender(); toast('Fecha guardada'); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
  }

  /* ---------------- FECHAS IMPORTANTES ---------------- */
  function occurrence(f) {   // próxima fecha (>= hoy) de una fecha importante
    if (!f.repite) return f.fecha;
    const p = f.fecha.split('-').map(Number), y = Number(todayStr().slice(0, 4));
    for (let k = 0; k < 2; k++) { const yy = y + k, kk = ymd(yy, p[1] - 1, Math.min(p[2], dim(yy, p[1] - 1))); if (kk >= todayStr()) return kk; }
    return f.fecha;
  }
  function upcoming(count) {
    const out = [];
    D.fechas.forEach((f) => { if (!isDate(f.fecha)) return; const k = occurrence(f), d = daysTo(k); if (d >= 0) out.push({ titulo: f.titulo, k, dias: d, tipo: 'f', id: f.id, nota: f.nota }); });
    nextAnniv(count).forEach((a) => out.push({ titulo: a.label + ' juntos', k: a.k, dias: a.dias, tipo: 'a' }));
    return out.sort((a, b) => a.dias - b.dias).slice(0, count);
  }
  const cuando = (d) => (d === 0 ? '¡hoy!' : d === 1 ? 'mañana' : 'en ' + d + ' días');
  function vFechas() {
    const w = W(), anSet = new Set(); if (startParts()) for (let n = 1; n < 600; n++) anSet.add(annivDate(n));
    const fechasEn = (k) => D.fechas.filter((f) => isDate(f.fecha) && (f.fecha === k || (f.repite && f.fecha.slice(5) === k.slice(5))));
    const prox = upcoming(8);
    w.innerHTML = '<div style="margin-bottom:.7rem"><button class="hb-btn hb-adm" id="f-new" type="button">＋ Nueva fecha</button></div><div id="hb-c"></div><div id="hb-day" style="margin-top:.8rem"></div>' +
      '<div class="hb-card" style="margin-top:.8rem"><h3>Próximas</h3>' + (prox.length ? '<div class="hb-list">' + prox.map((a) => '<button type="button" class="hb-item" data-id="' + esc(a.id || '') + '">' + (a.tipo === 'a' ? '🎂 ' : '💌 ') + esc(a.titulo) + '<small>' + fmtDate(a.k) + ' · ' + cuando(a.dias) + '</small></button>').join('') + '</div>' : '<p>Aún no hay fechas. Cuando se configure el inicio, los aniversarios aparecen solos.</p>') + '</div>' +
      '<div class="hb-card"><h3>📬 Recordatorios por correo</h3><p>Pon tu correo y te avisamos antes de cada fecha importante.</p><div class="row2"><input class="hb-in" id="c-m" type="email" placeholder="tu correo" autocomplete="email" aria-label="Tu correo"><button class="hb-btn" id="c-g" type="button" style="margin:0">Guardar</button></div><div class="hb-small" id="c-e" style="min-height:1.2em;margin-top:.3rem"></div><button class="hb-btn ghost hb-adm" id="c-adm" type="button">⚙ Correos y avisos (admin)</button></div>';
    calendar($('hb-c'), (k) => (fechasEn(k).length ? '💌' : anSet.has(k) ? '🎂' : ''), (k) => {
      const fs = fechasEn(k), an = anSet.has(k);
      $('hb-day').innerHTML = '<div class="hb-card"><h3>' + fmtDate(k) + '</h3>' + (fs.length || an ? fs.map((f) => '<div class="hb-item" style="margin-bottom:.4rem"><b>💌 ' + esc(f.titulo) + '</b>' + (f.nota ? '<small>' + esc(f.nota) + '</small>' : '') + '<small>Avisar: ' + esc(f.avisar) + '</small><button class="hb-btn ghost hb-adm" data-ed="' + esc(f.id) + '" type="button">✎ Editar</button></div>').join('') + (an ? '<div class="hb-item">🎂 Aniversario</div>' : '') : '<p>Sin fechas este día.</p>') + '</div>';
      $('hb-day').querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => editFecha(D.fechas.find((f) => f.id === b.dataset.ed)); });
    }, {});
    w.querySelectorAll('.hb-item[data-id]').forEach((b) => { if (b.dataset.id) b.onclick = () => { if (admin) editFecha(D.fechas.find((f) => f.id === b.dataset.id)); }; });
    $('f-new').onclick = () => editFecha(null);
    if (D.correo_ella_edita === false) { const row = $('c-m').parentElement; row.style.display = 'none'; $('c-e').textContent = 'Tu correo ya está registrado para los avisos 💌'; }
    $('c-adm').onclick = adminCorreos;
    $('c-g').onclick = async () => {
      const m = $('c-m').value.trim(), e = $('c-e');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) { e.textContent = 'Escribe un correo válido.'; return; }
      e.textContent = 'Guardando…';
      try { const j = await api('POST', null, { action: 'correo_set', correo: m }); e.textContent = j && j.ok ? '¡Listo! Te enviamos un correo de confirmación 💌' : errTxt(j); }
      catch (x) { e.textContent = 'Sin conexión. Intenta otra vez.'; }
    };
  }
  function editFecha(f) {
    const d = f || { id: '', titulo: '', fecha: '', nota: '', repite: true, avisar: 'ambos', dias_antes: D.dias_antes || 1 };
    modal('<h3>' + (d.id ? 'Editar fecha' : 'Nueva fecha importante') + '</h3><label>Título<input class="hb-in" id="x-t" maxlength="100" value="' + esc(d.titulo) + '"></label><label>Fecha<input class="hb-in" id="x-d" type="date" value="' + esc(d.fecha) + '"></label>' +
      '<label>Nota<textarea class="hb-in" id="x-n" rows="2" maxlength="300">' + esc(d.nota) + '</textarea></label><div class="cks"><label><input type="checkbox" id="x-r"' + (d.repite ? ' checked' : '') + '>Se repite cada año</label></div>' +
      '<div class="row"><label>Avisar a<select class="hb-in" id="x-a">' + ['ambos', 'ella', 'yo', 'nadie'].map((o) => '<option' + (d.avisar === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></label><label>Días antes<input class="hb-in" id="x-b" type="number" min="0" max="30" value="' + esc(d.dias_antes) + '"></label></div><div class="err" id="x-e"></div>' +
      '<div class="row"><button class="hb-btn ghost" id="x-x" type="button">Cancelar</button><button class="hb-btn" id="x-g" type="button">Guardar</button></div>' + (d.id ? '<button class="hb-btn danger" id="x-del" type="button">Borrar fecha</button>' : ''));
    $('x-x').onclick = closeModal;
    if ($('x-del')) $('x-del').onclick = async () => { if (!confirm('¿Borrar esta fecha?')) return; closeModal(); const j = await adminPost('fecha_borrar', { id: d.id }); if (j.ok) { await load(); rerender(); toast('Fecha borrada'); } else if (j.error !== 'cancel') toast(errTxt(j)); };
    $('x-g').onclick = async () => {
      const t = $('x-t').value.trim(), k = $('x-d').value; if (!t) { $('x-e').textContent = 'Escribe un título.'; return; } if (!isDate(k)) { $('x-e').textContent = 'Elige la fecha.'; return; }
      closeModal(); const j = await adminPost('fecha_guardar', { id: d.id, titulo: t, fecha: k, nota: $('x-n').value.trim(), repite: $('x-r').checked, avisar: $('x-a').value, dias_antes: Number($('x-b').value) });
      if (j.ok) { await load(); rerender(); toast('Fecha guardada'); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
  }
  /* ---------------- ADMINISTRADOR DE CORREOS (los dos) ---------------- */
  const cuandoAviso = (p) => (p.aviso_en < 0 ? 'el aviso ya pasó' : p.aviso_en === 0 ? 'se avisa HOY' : 'se avisa en ' + pl(p.aviso_en, 'día', 'días'));
  const quien = (a) => (a === 'yo' ? 'solo a mí' : a === 'ella' ? 'solo a ella' : 'a los dos');
  async function adminCorreos() {
    const r = await adminPost('correos_leer', {}); if (!r.ok) { if (r.error !== 'cancel') toast(errTxt(r)); return; }
    let c = r.correos || {}, est = r.estado || {};
    const chip = (v) => (v ? '<span class="mc-chip ok">✓ configurado</span>' : '<span class="mc-chip no">⚠ falta</span>');
    const person = (rol, titulo, val) => '<div class="mc-p"><div class="mc-h"><b>' + titulo + '</b>' + chip(val) + '</div><input class="hb-in" id="m-' + rol + '" type="email" placeholder="correo@ejemplo.com" autocomplete="off" value="' + esc(val) + '" aria-label="Correo ' + titulo + '"><div class="row"><button class="hb-btn" data-sv="' + rol + '" type="button" style="margin:0">Guardar</button><button class="hb-btn ghost" data-ts="' + rol + '" type="button" style="margin:0"' + (val ? '' : ' disabled') + '>✉ Probar</button><button class="hb-btn ghost" data-rm="' + rol + '" type="button" style="margin:0"' + (val ? '' : ' disabled') + '>Quitar</button></div></div>';
    const draw = (nota) => {
      const prox = (est.proximos || []).map((p) => '<li><b>' + esc(p.titulo) + '</b><small>' + fmtDate(p.fecha) + ' · ' + cuandoAviso(p) + ' · ' + quien(p.avisar) + '</small></li>').join('');
      modal('<h3>📬 Administrador de correos</h3><p class="hb-small">Los avisos salen desde tu cuenta de Google. Aquí ves y cambias el correo de los dos.</p>' +
        person('yo', 'Yo', c.yo) + person('ella', 'Ella', c.ella) +
        '<div class="mc-p"><div class="mc-h"><b>Avisos</b></div><div class="cks"><label><input type="checkbox" id="m-a"' + (D.aniversarios_correo ? ' checked' : '') + '>Avisar aniversarios mensuales y anuales</label><label><input type="checkbox" id="m-ed"' + (D.correo_ella_edita !== false ? ' checked' : '') + '>Ella puede cambiar su correo desde el sitio</label></div><label>Días de anticipación por defecto<input class="hb-in" id="m-b" type="number" min="0" max="30" value="' + esc(D.dias_antes == null ? 1 : D.dias_antes) + '"></label><button class="hb-btn ghost" id="m-cfg" type="button" style="margin:0">Guardar avisos</button></div>' +
        '<div class="mc-p"><div class="mc-h"><b>Estado</b>' + (est.trigger ? '<span class="mc-chip ok">⏰ avisos diarios activos</span>' : '<span class="mc-chip no">⚠ avisos diarios apagados</span>') + '</div>' +
        '<small class="hb-small">Hora de envío: 8:00 a. m. · Correos que quedan hoy: ' + (est.cuota == null ? '—' : esc(est.cuota)) + '</small>' +
        '<button class="hb-btn ghost" id="m-t" type="button" style="margin:0">' + (est.trigger ? '↻ Reinstalar avisos diarios' : '⏰ Activar avisos diarios') + '</button>' +
        '<div class="mc-h" style="margin-top:.3rem"><b>Próximos avisos</b></div>' + (prox ? '<ul class="mc-l">' + prox + '</ul>' : '<small class="hb-small">No hay fechas próximas con aviso.</small>') + '</div>' +
        '<div class="err" id="m-r" role="status">' + (nota || '') + '</div><div class="row"><button class="hb-btn ghost" id="m-pa" type="button" style="margin:0">✉ Prueba a los dos</button><button class="hb-btn" id="m-x" type="button" style="margin:0">Cerrar</button></div>');
      if (nota) $('m-r').style.color = '#9fe3a5';
      wire();
    };
    const say = (t, ok) => { const e = $('m-r'); if (!e) return; e.style.color = ok ? '#9fe3a5' : ''; e.textContent = t; };
    const refresh = async (nota) => { const q = await adminPost('correos_leer', {}); if (q.ok) { c = q.correos || {}; est = q.estado || {}; await load(); draw(nota); } else say(errTxt(q)); };
    const wire = () => {
      const m = $('hb-modal');
      $('m-x').onclick = closeModal;
      m.querySelectorAll('[data-sv]').forEach((b) => { b.onclick = async () => {
        const rol = b.dataset.sv, v = $('m-' + rol).value.trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { say('Ese correo no es válido.'); return; }
        const j = await adminPost('correos_guardar', { [rol]: v }); if (j.ok) refresh('Guardado ✓'); else say(errTxt(j));
      }; });
      m.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => {
        const rol = b.dataset.rm; if (!confirm('¿Quitar el correo de ' + (rol === 'yo' ? 'ti' : 'ella') + '? Ya no recibirá avisos.')) return;
        const j = await adminPost('correos_guardar', { [rol]: '' }); if (j.ok) refresh('Correo quitado'); else say(errTxt(j));
      }; });
      const test = async (rol) => { const j = await adminPost('correo_prueba', { rol }); if (j.ok) say('Prueba enviada a ' + pl(j.enviados, 'correo', 'correos') + ' ✓ (revisa también spam). Quedan ' + j.cuota + ' hoy.', true); else say(j.error === 'sin-correos' ? 'Primero guarda ese correo.' : errTxt(j)); };
      m.querySelectorAll('[data-ts]').forEach((b) => { b.onclick = () => test(b.dataset.ts); });
      $('m-pa').onclick = () => test('ambos');
      $('m-cfg').onclick = async () => {
        const dias = Number($('m-b').value); if (!(dias >= 0 && dias <= 30)) { say('Los días van de 0 a 30.'); return; }
        const j = await adminPost('config_guardar', { aniversarios_correo: $('m-a').checked, correo_ella_edita: $('m-ed').checked, dias_antes: dias });
        if (j.ok) refresh('Avisos guardados ✓'); else say(errTxt(j));
      };
      $('m-t').onclick = async () => { const j = await adminPost('recordatorios_activar', {}); if (j.ok) refresh('Avisos diarios activados (8:00 a. m.) ✓'); else say(errTxt(j)); };
    };
    draw('');
  }

  /* ---------------- CARTAS DIARIAS 2027 ---------------- */
  let CD = { ok: false, hoy: '', inicio: '2027-01-01', fin: '2027-12-31', disponibles: [] };
  try { const c = JSON.parse(localStorage.getItem('hub_cartas_idx') || 'null'); if (c && Array.isArray(c.disponibles)) CD = Object.assign(CD, c, { ok: false }); } catch (e) {}
  async function loadCartas() {
    try { const j = await api('GET', { action: 'cartas_dias' }); if (j && j.ok === true && Array.isArray(j.disponibles)) { CD = Object.assign({}, j, { ok: true }); try { localStorage.setItem('hub_cartas_idx', JSON.stringify(j)); } catch (e) {} } } catch (e) {}
  }
  const hoyCartas = () => (CD.ok && CD.hoy ? CD.hoy : todayStr());
  const dispCartas = () => CD.disponibles.filter((x) => x.fecha <= hoyCartas()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const daysBetween = (a, b) => { const p = a.split('-').map(Number), q = b.split('-').map(Number); return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000); };
  const cartaCache = () => { try { return JSON.parse(localStorage.getItem('hub_cartas') || '{}'); } catch (e) { return {}; } };
  function vCartas() {
    const w = W(), hoy = hoyCartas(), disp = new Set(dispCartas().map((x) => x.fecha));
    let top;
    if (hoy < CD.inicio) top = '<p>Las cartas diarias empiezan el ' + fmtDate(CD.inicio) + ' (faltan ' + pl(daysBetween(hoy, CD.inicio), 'día', 'días') + ').</p>';
    else if (disp.has(hoy)) top = '<p>Tu carta de hoy ya está lista.</p><button class="hb-btn" id="c-hoy" type="button">💌 Leer la carta de hoy</button>';
    else top = '<p>La carta de hoy llegará pronto.</p>';
    w.innerHTML = '<div class="hb-card"><h3>💌 Cartas diarias</h3>' + top + ' <button class="hb-btn ghost" id="c-reg" type="button">Abrir mi regalo ✉</button></div><div style="margin-bottom:.7rem"><button class="hb-btn ghost hb-adm" id="c-imp" type="button">📥 Importar cartas</button></div><div id="hb-c"></div>';
    $('c-reg').onclick = closeHub; if ($('c-hoy')) $('c-hoy').onclick = () => openCarta(hoy); $('c-imp').onclick = importCartas;
    const inRange = hoy >= CD.inicio && hoy <= CD.fin, base = (inRange ? hoy : CD.inicio).split('-').map(Number);
    calendar($('hb-c'), (k) => (k < CD.inicio || k > CD.fin ? '' : disp.has(k) ? '💌' : k > hoy ? '🔒' : ''), (k) => {
      if (disp.has(k)) openCarta(k);
      else if (admin && k >= CD.inicio && k <= CD.fin) editCarta(k);
      else if (k > hoy && k >= CD.inicio && k <= CD.fin) toast('Esta carta se abre el ' + fmtDate(k));
      else if (k >= CD.inicio && k <= CD.fin) toast('Esta carta aún no está escrita');
    }, { y: base[0], m: base[1] - 1 });
  }
  async function openCarta(k) {
    let c = null;
    try {
      const j = await api('GET', { action: 'carta_dia', fecha: k });
      if (j && j.ok === true) {
        if (j.bloqueada) { toast('Esta carta se abre el ' + fmtDate(k)); return; }
        if (j.vacia) { toast('Esta carta aún no está escrita'); return; }
        c = { fecha: k, titulo: j.titulo, texto: j.texto };
        try { const cc = cartaCache(); cc[k] = { titulo: c.titulo, texto: c.texto }; localStorage.setItem('hub_cartas', JSON.stringify(cc)); } catch (e) {}
      } else throw new Error('x');
    } catch (e) { const g = cartaCache()[k]; if (!g) { toast('Sin conexión y esta carta no se ha abierto antes'); return; } c = { fecha: k, titulo: g.titulo, texto: g.texto }; }
    showCarta(c);
  }
  function showCarta(c) {
    const L = $('hb-letter'), seenKey = 'carta_vista_' + c.fecha;
    let seen = true; try { seen = localStorage.getItem(seenKey) === '1'; } catch (e) {}
    const first = c.fecha === hoyCartas() && !seen && !RM;
    try { localStorage.setItem(seenKey, '1'); } catch (e) {}
    const list = dispCartas(), i = list.findIndex((x) => x.fecha === c.fecha), fav = D.favoritos_cartas.includes(c.fecha);
    L.innerHTML = (first ? '<div class="lenv"><span>💌</span><p>Tu carta de hoy</p></div>' : '') + '<div class="lpaper' + (first ? ' first' : '') + '"><button class="hb-ib lx" id="l-x" type="button" aria-label="Cerrar">✕</button><div class="ld">' + fmtDate(c.fecha) + '</div><h3 class="lt">' + esc(c.titulo || 'Para ti') + '</h3><div class="lb">' + String(c.texto).split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') + '</div>' +
      '<div class="vrow"><button class="hb-btn" id="l-fav" type="button">' + (fav ? '♥ Favorita' : '♡ Favorita') + '</button><button class="hb-btn ghost" id="l-prev" type="button"' + (i > 0 ? '' : ' disabled') + '>‹ Anterior</button><button class="hb-btn ghost" id="l-next" type="button"' + (i >= 0 && i < list.length - 1 ? '' : ' disabled') + '>Siguiente ›</button><button class="hb-btn ghost hb-adm" id="l-ed" type="button">✎ Editar</button></div></div>';
    L.classList.add('on'); L.setAttribute('aria-hidden', 'false'); L.scrollTop = 0;
    $('l-x').onclick = closeCarta; $('l-fav').onclick = () => toggleFavCarta(c);
    if (i > 0) $('l-prev').onclick = () => openCarta(list[i - 1].fecha);
    if (i >= 0 && i < list.length - 1) $('l-next').onclick = () => openCarta(list[i + 1].fecha);
    $('l-ed').onclick = () => { closeCarta(); editCarta(c.fecha); };
  }
  function closeCarta() { const L = $('hb-letter'); L.classList.remove('on'); L.setAttribute('aria-hidden', 'true'); L.innerHTML = ''; }
  async function toggleFavCarta(c) {
    const on = !D.favoritos_cartas.includes(c.fecha);
    D.favoritos_cartas = on ? D.favoritos_cartas.concat(c.fecha) : D.favoritos_cartas.filter((x) => x !== c.fecha);
    try { localStorage.setItem(LS, JSON.stringify(D)); } catch (e) {}
    showCarta(c);
    try { const j = await api('POST', null, { action: 'fav', tipo: 'carta', fecha: c.fecha, on }); if (!j || j.ok !== true) throw new Error('x'); }
    catch (e) { D.favoritos_cartas = on ? D.favoritos_cartas.filter((x) => x !== c.fecha) : D.favoritos_cartas.concat(c.fecha); showCarta(c); toast('No se pudo guardar el favorito'); }
  }
  async function editCarta(k) {
    const r = await adminPost('carta_leer', { fecha: k }); if (!r.ok) { if (r.error !== 'cancel') toast(errTxt(r)); return; }
    modal('<h3>Carta del ' + fmtDate(k) + '</h3><label>Título<input class="hb-in" id="k-t" maxlength="120" value="' + esc(r.titulo) + '"></label><label>Texto (línea en blanco = nuevo párrafo)<textarea class="hb-in" id="k-x" rows="10" maxlength="4000">' + esc(r.texto) + '</textarea></label><div class="err" id="k-e"></div><div class="row"><button class="hb-btn ghost" id="k-c" type="button">Cancelar</button><button class="hb-btn" id="k-g" type="button">Guardar</button></div>');
    $('k-c').onclick = closeModal;
    $('k-g').onclick = async () => { const j = await adminPost('carta_guardar', { fecha: k, titulo: $('k-t').value.trim(), texto: $('k-x').value }); if (j.ok) { closeModal(); await loadCartas(); rerender(); toast('Carta guardada'); } else { $('k-e').textContent = errTxt(j); } };
  }
  function importCartas() {
    modal('<h3>Importar cartas</h3><p class="hb-small">Una carta por línea:<br><b>2027-01-01 | Título | Texto de la carta</b><br>Usa <b>\\n\\n</b> dentro del texto para separar párrafos. También puedes escribirlas directo en la hoja CARTAS de Google Sheets.</p><textarea class="hb-in" id="i-t" rows="9" placeholder="2027-01-01 | Feliz año | Mi amor, hoy empieza..."></textarea><div class="err" id="i-e"></div><div class="row"><button class="hb-btn ghost" id="i-c" type="button">Cancelar</button><button class="hb-btn" id="i-g" type="button">Importar</button></div>');
    $('i-c').onclick = closeModal;
    $('i-g').onclick = async () => {
      const rows = [];
      $('i-t').value.split('\n').forEach((ln) => { if (!ln.trim()) return; const parts = ln.split('|'); if (parts.length < 3) return; const f = parts[0].trim(); if (!isDate(f)) return; rows.push({ fecha: f, titulo: parts[1].trim(), texto: parts.slice(2).join('|').trim().replace(/\\n/g, '\n') }); });
      if (!rows.length) { $('i-e').textContent = 'No encontré líneas válidas (fecha | título | texto).'; return; }
      $('i-g').disabled = true; let ok = 0, i = 0;
      while (i < rows.length) {
        const chunk = []; let size = 0;
        while (i < rows.length && chunk.length < 20 && size + rows[i].texto.length < 6000) { chunk.push(rows[i]); size += rows[i].texto.length + 200; i++; }
        if (!chunk.length) { chunk.push(rows[i]); i++; }
        $('i-e').style.color = '#9fe3a5'; $('i-e').textContent = 'Importando ' + Math.min(i, rows.length) + ' / ' + rows.length + '…';
        const j = await adminPost('cartas_importar', { cartas: chunk });
        if (!j.ok) { $('i-e').style.color = ''; $('i-e').textContent = errTxt(j); $('i-g').disabled = false; return; }
        ok += j.importadas || 0;
      }
      closeModal(); await loadCartas(); rerender(); toast('Cartas importadas: ' + ok);
    };
  }

  /* ---------------- Recuerdo del día + agregar recuerdo ---------------- */
  let recDismissed = false;
  function recuerdoDelDia() {
    const t = todayStr(), md = t.slice(5), y = Number(t.slice(0, 4)), c = [];
    photos().forEach((p) => { if (isDate(p.fecha)) c.push({ k: p.fecha, foto: p }); });
    D.lugares.forEach((l) => placeDates(l).forEach((k) => c.push({ k, lugar: l })));
    D.fechas.forEach((f) => { if (isDate(f.fecha) && !f.repite) c.push({ k: f.fecha, titulo: f.titulo }); });
    let pool = c.filter((x) => x.k.slice(5) === md && Number(x.k.slice(0, 4)) < y), exact = true;
    if (!pool.length) { pool = c.filter((x) => x.k < t); exact = false; }
    if (!pool.length) return null;
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = pool[h % pool.length], day = c.filter((x) => x.k === pick.k);
    return { k: pick.k, exact, anios: y - Number(pick.k.slice(0, 4)), fotos: day.filter((x) => x.foto).map((x) => x.foto).slice(0, 3), lugares: day.filter((x) => x.lugar).map((x) => x.lugar.nombre), titulos: day.filter((x) => x.titulo).map((x) => x.titulo) };
  }
  function recuerdoCard() {
    if (recDismissed) return '';
    const r = recuerdoDelDia(); if (!r) return '';
    const head = r.exact ? (r.anios === 1 ? 'Hace un año, en este día…' : 'Hace ' + r.anios + ' años, en este día…') : 'Un recuerdo nuestro…';
    const det = r.lugares.concat(r.titulos).map((x) => '<span class="hb-chip">' + esc(x) + '</span>').join('');
    return '<div class="hb-card" id="hb-rec"><h3>🌅 Recuerdo del día</h3><p><b>' + head + '</b></p><p class="hb-small">' + fmtDate(r.k) + '</p>' + (det ? '<p>' + det + '</p>' : '') + (r.fotos.length ? '<div class="hb-grid" style="margin-top:.4rem">' + r.fotos.map((p, i) => '<button class="hb-ph" type="button" data-rf="' + i + '"><img loading="lazy" alt="" src="' + thumbSrc(p) + '"><span class="miss">Falta</span></button>').join('') + '</div>' : '') + '<button class="hb-btn ghost" id="hb-rec-x" type="button">Cerrar</button></div>';
  }
  function bindRecuerdo(w) {
    const x = w.querySelector('#hb-rec-x'); if (x) x.onclick = () => { recDismissed = true; const c = $('hb-rec'); if (c) c.remove(); };
    const r = recuerdoDelDia();
    if (r) w.querySelectorAll('[data-rf]').forEach((b) => { b.querySelector('img').addEventListener('error', () => b.classList.add('bad')); b.onclick = () => openViewer(r.fotos, Number(b.dataset.rf)); });
  }
  async function compress(file, maxSide, maxBytes, quals) {
    maxSide = maxSide || 1280; maxBytes = maxBytes || 520000; quals = quals || [0.82, 0.72, 0.62, 0.5, 0.4];
    let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
    const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    for (const q of quals) { const b = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q)); if (b && b.size <= maxBytes) return b; }
    return null;
  }
  const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  function addRecuerdo() {
    modal('<h3>＋ Agregar un recuerdo</h3><p class="hb-small">Escribe una nota, sube una foto, o ambas. Aparecerá en el sitio cuando se apruebe 💌</p>' +
      '<label>Tu nota<textarea class="hb-in" id="a-t" rows="3" maxlength="600" placeholder="Lo que quieras recordar…"></textarea></label><label>Foto (opcional)<input class="hb-in" id="a-f" type="file" accept="image/*"></label>' +
      '<div class="row"><label>Lugar<select class="hb-in" id="a-l"><option value="">—</option>' + D.lugares.map((l) => '<option value="' + esc(l.id) + '">' + esc(l.nombre) + '</option>').join('') + '</select></label><label>Fecha<input class="hb-in" id="a-d" type="date"></label></div>' +
      '<label>Categoría<select class="hb-in" id="a-c"><option value="">—</option>' + D.categorias.map((c) => '<option>' + esc(c) + '</option>').join('') + '</select></label><div class="err" id="a-e"></div>' +
      '<div class="row"><button class="hb-btn ghost" id="a-x" type="button">Cancelar</button><button class="hb-btn" id="a-g" type="button">Enviar</button></div>');
    $('a-x').onclick = closeModal;
    $('a-g').onclick = async () => {
      const t = $('a-t').value.trim(), f = $('a-f').files[0], e = $('a-e'); e.style.color = '';
      if (!t && !f) { e.textContent = 'Escribe una nota o elige una foto.'; return; }
      $('a-g').disabled = true; e.style.color = '#9fe3a5'; e.textContent = 'Enviando…';
      try {
        const body = { action: f ? 'pend_foto' : 'pend_nota', texto: t, lugar_id: $('a-l').value, fecha: $('a-d').value, categoria: $('a-c').value };
        if (f) { const blob = await compress(f); if (!blob) throw Object.assign(new Error('x'), { code: 'tamano' }); body.imagen = await toB64(blob); }
        const j = await api('POST', null, body);
        if (j && j.ok) { closeModal(); toast('¡Enviado! Se verá cuando se apruebe 💌'); } else { e.style.color = ''; e.textContent = errTxt(j); $('a-g').disabled = false; }
      } catch (x) { e.style.color = ''; e.textContent = x && x.code === 'tamano' ? 'La foto es demasiado grande.' : 'No se pudo enviar. Revisa tu conexión.'; $('a-g').disabled = false; }
    };
  }

  /* ---------------- Subir fotos desde el administrador (van a tu Drive privado) ---------------- */
  function subirFotos() {
    const cats = D.categorias.slice();
    modal('<h3>＋ Subir fotos</h3><p class="hb-small">Las fotos se guardan en tu Drive privado (no en GitHub). Puedes elegir varias; los datos de abajo se aplican a todas y luego puedes editar cada una.</p>' +
      '<label>Fotos<input class="hb-in" id="u-f" type="file" accept="image/*" multiple></label>' +
      '<div class="row"><label>Lugar<select class="hb-in" id="u-l"><option value="">— sin lugar —</option>' + D.lugares.map((l) => '<option value="' + esc(l.id) + '">' + esc(l.nombre) + '</option>').join('') + '</select></label><label>Fecha<input class="hb-in" id="u-d" type="date"></label></div>' +
      '<p class="hb-small">Si dejas la fecha vacía se usa la fecha de cada archivo.</p>' +
      '<label>Categorías</label><div class="cks" id="u-c">' + cats.map((c) => '<label><input type="checkbox" value="' + esc(c) + '">' + esc(c) + '</label>').join('') + '</div>' +
      '<label>Nota (opcional)<textarea class="hb-in" id="u-n" rows="2" maxlength="300"></textarea></label><div class="err" id="u-e"></div>' +
      '<div class="row"><button class="hb-btn ghost" id="u-x" type="button">Cancelar</button><button class="hb-btn" id="u-g" type="button">Subir</button></div>');
    let cancelled = false; $('u-x').onclick = () => { cancelled = true; closeModal(); };
    $('u-g').onclick = async () => {
      const files = Array.from($('u-f').files), e = $('u-e'); if (!files.length) { e.textContent = 'Elige al menos una foto.'; return; }
      const lugar = $('u-l').value, fecha = $('u-d').value, nota = $('u-n').value.trim(), cs = Array.from($('u-c').querySelectorAll('input:checked')).map((i) => i.value);
      $('u-g').disabled = true; e.style.color = '#9fe3a5'; let ok = 0, fail = 0;
      for (let i = 0; i < files.length && !cancelled; i++) {
        e.style.color = '#9fe3a5'; e.textContent = 'Subiendo ' + (i + 1) + ' de ' + files.length + '…';
        try {
          const big = await compress(files[i]), th = await compress(files[i], 360, 40000, [0.7, 0.6, 0.5, 0.4, 0.3]);
          if (!big) throw new Error('tamano');
          const lm = new Date(files[i].lastModified), fd = fecha || (isFinite(lm) ? ymd(lm.getFullYear(), lm.getMonth(), lm.getDate()) : '');
          const j = await adminPost('foto_subir', { imagen: await toB64(big), miniatura: th ? await toB64(th) : '', lugar_id: lugar, fecha: fd, categorias: cs, nota });
          if (j.ok) ok++; else { fail++; if (j.error === 'clave' || j.error === 'bloqueado' || j.error === 'cancel') { e.style.color = ''; e.textContent = errTxt(j); break; } }
        } catch (x) { fail++; }
      }
      await load(); rerender();
      if (cancelled) return;
      if (!fail) { closeModal(); toast('Fotos subidas: ' + ok); }
      else { $('u-g').disabled = false; e.style.color = ''; e.textContent = 'Subidas: ' + ok + ' · Con error: ' + fail + '. Revisa e intenta con las que faltan.'; }
    };
  }

  /* ---------------- PENDIENTES (admin) ---------------- */
  async function vPend() {
    const w = W();
    if (!admin) { w.innerHTML = '<div class="hb-card"><h3>📥 Pendientes</h3><p>Esta sección es solo para el administrador. Entra desde el menú ☰ → Admin.</p></div>'; return; }
    w.innerHTML = '<p class="hb-small">Cargando…</p>';
    const j = await adminPost('pend_listar', {}); if (cur !== 'pend') return;
    if (!j.ok) { w.innerHTML = '<div class="hb-card"><p>' + (j.error === 'cancel' ? 'Necesitas la clave de administrador.' : esc(errTxt(j))) + '</p><button class="hb-btn" id="pd-r" type="button">Reintentar</button></div>'; $('pd-r').onclick = vPend; return; }
    if (!j.pendientes.length) { w.innerHTML = '<div class="hb-card"><h3>📥 Pendientes</h3><p>No hay nada por aprobar.</p></div>'; return; }
    w.innerHTML = j.pendientes.map((p) => '<div class="hb-card" data-id="' + esc(p.id) + '"><h3>' + (p.tipo === 'foto' ? '🖼️ Foto' : '💬 Nota') + '</h3>' + (p.tipo === 'foto' ? '<img class="pd-img" alt="" style="max-width:100%;max-height:240px;border-radius:10px;display:block;margin-bottom:.4rem">' : '') + (p.texto ? '<p>' + esc(p.texto) + '</p>' : '') + '<p class="hb-small">' + (p.fecha ? fmtDate(p.fecha) + ' · ' : '') + (lugarById(p.lugar_id) ? esc(lugarById(p.lugar_id).nombre) + ' · ' : '') + esc(p.categoria || '') + '</p><button class="hb-btn" data-ok="' + esc(p.id) + '" type="button">Aprobar</button> <button class="hb-btn danger" data-no="' + esc(p.id) + '" type="button">Rechazar</button></div>').join('');
    j.pendientes.forEach((p) => {
      const card = w.querySelector('[data-id="' + p.id + '"]');
      if (p.tipo === 'foto') adminPost('foto_drive_admin', { id: p.drive_id }).then((r) => { const im = card && card.querySelector('.pd-img'); if (im && r.ok) im.src = r.data; });
      card.querySelector('[data-no]').onclick = async () => { if (!confirm('¿Rechazar esto? Si es foto, se manda a la papelera.')) return; const r = await adminPost('pend_rechazar', { id: p.id }); if (r.ok) { toast('Rechazado'); vPend(); } else if (r.error !== 'cancel') toast(errTxt(r)); };
      card.querySelector('[data-ok]').onclick = () => aprobar(p);
    });
  }
  function aprobar(p) {
    const cats = D.categorias.slice(); if (p.categoria && cats.indexOf(p.categoria) < 0) cats.push(p.categoria);
    modal('<h3>Aprobar</h3><label>Lugar<select class="hb-in" id="o-l"><option value="">— sin lugar —</option>' + D.lugares.map((l) => '<option value="' + esc(l.id) + '"' + (p.lugar_id === l.id ? ' selected' : '') + '>' + esc(l.nombre) + '</option>').join('') + '</select></label><label>Fecha<input class="hb-in" id="o-d" type="date" value="' + esc(p.fecha) + '"></label>' +
      (p.tipo === 'foto' ? '<label>Categorías</label><div class="cks" id="o-c">' + cats.map((c) => '<label><input type="checkbox" value="' + esc(c) + '"' + (c === p.categoria ? ' checked' : '') + '>' + esc(c) + '</label>').join('') + '</div><label>Nota<textarea class="hb-in" id="o-n" rows="2" maxlength="300">' + esc(p.texto) + '</textarea></label>' : '') + '<div class="err" id="o-e"></div><div class="row"><button class="hb-btn ghost" id="o-x" type="button">Cancelar</button><button class="hb-btn" id="o-g" type="button">Aprobar</button></div>');
    $('o-x').onclick = closeModal;
    $('o-g').onclick = async () => {
      const data = { id: p.id, lugar_id: $('o-l').value, fecha: $('o-d').value };
      if (p.tipo === 'foto') { data.categorias = Array.from($('o-c').querySelectorAll('input:checked')).map((i) => i.value); data.nota = $('o-n').value.trim(); }
      closeModal(); const j = await adminPost('pend_aprobar', data);
      if (j.ok) { await load(); toast('Aprobado ✓'); vPend(); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
  }

  /* ---------------- FOTOS ---------------- */
  function filtered(list) {
    const fav = favSet();
    return list.filter((p) => {
      if (F.fav && !fav.has(p.archivo)) return false;
      if (F.lugar === '__none' ? !!(p.lugar_id && lugarById(p.lugar_id)) : (F.lugar && p.lugar_id !== F.lugar)) return false;
      if (F.cat && p.categorias.indexOf(F.cat) < 0) return false;
      if ((F.desde || F.hasta) && !p.fecha) return false;
      if (F.desde && p.fecha < F.desde) return false;
      if (F.hasta && p.fecha > F.hasta) return false;
      return true;
    }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }
  function gridHtml(list) {
    if (!list.length) return photos().length ? '<div class="hb-card" style="text-align:center"><h3>Ninguna foto con estos filtros</h3><p>Prueba quitando algún filtro 💌</p></div>' : '<div class="hb-card" style="text-align:center"><h3>📷 Aquí vivirán nuestras fotos</h3><p>Muy pronto vamos a llenar este álbum de recuerdos.</p>' + (admin ? '<p class="hb-small">Súbelas desde ＋ Subir fotos.</p>' : '') + '</div>';
    const fav = favSet();
    return '<div class="hb-grid">' + list.map((p, i) => '<button class="hb-ph" type="button" data-i="' + i + '" aria-label="Foto ' + esc(p.archivo) + '"><img loading="lazy" decoding="async" alt="" src="' + thumbSrc(p) + '"><span class="miss">Falta ' + esc(p.archivo) + '</span>' + (fav.has(p.archivo) ? '<span class="fv">♥</span>' : '') + (!p.lugar_id || !lugarById(p.lugar_id) ? '<span class="un">sin clasificar</span>' : '') + '</button>').join('') + '</div>';
  }
  function bindGrid(host, list) {
    host.querySelectorAll('.hb-ph').forEach((b) => { b.querySelector('img').addEventListener('error', () => b.classList.add('bad')); b.addEventListener('click', () => openViewer(list, Number(b.dataset.i))); });
  }
  function filtersHtml() {
    const cats = D.categorias.slice(); photos().forEach((p) => p.categorias.forEach((c) => { if (cats.indexOf(c) < 0) cats.push(c); }));
    return '<div class="hb-filters">' +
      '<label>Desde<input type="date" id="f-d" value="' + esc(F.desde) + '"></label><label>Hasta<input type="date" id="f-h" value="' + esc(F.hasta) + '"></label>' +
      '<label>Lugar<select id="f-l"><option value="">Todos</option><option value="__none"' + (F.lugar === '__none' ? ' selected' : '') + '>Sin clasificar</option>' + D.lugares.map((l) => '<option value="' + esc(l.id) + '"' + (F.lugar === l.id ? ' selected' : '') + '>' + esc(l.nombre) + '</option>').join('') + '</select></label>' +
      '<label>Categoría<select id="f-c"><option value="">Todas</option>' + cats.map((c) => '<option' + (F.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
      '<label>Favoritas<select id="f-f"><option value="">Todas</option><option value="1"' + (F.fav ? ' selected' : '') + '>Solo ♥</option></select></label></div>';
  }
  function bindFilters(redraw) {
    const m = { 'f-d': ['desde'], 'f-h': ['hasta'], 'f-l': ['lugar'], 'f-c': ['cat'] };
    Object.keys(m).forEach((id) => { const el = $(id); if (el) el.addEventListener('change', () => { F[m[id][0]] = el.value; redraw(); }); });
    const f = $('f-f'); if (f) f.addEventListener('change', () => { F.fav = f.value === '1'; redraw(); });
  }
  function vFotos() {
    const w = W();
    w.innerHTML = '<div style="margin-bottom:.7rem"><button class="hb-btn hb-adm" id="f-up" type="button">＋ Subir fotos</button></div><div class="hb-tabs" role="tablist"><button class="hb-tab' + (fotosTab === 'cal' ? ' on' : '') + '" data-t="cal" role="tab" type="button">📅 Calendario</button><button class="hb-tab' + (fotosTab === 'album' ? ' on' : '') + '" data-t="album" role="tab" type="button">🖼️ Álbum</button></div>' + filtersHtml() + '<div id="hb-fb"></div>';
    w.querySelectorAll('.hb-tab').forEach((b) => b.addEventListener('click', () => { fotosTab = b.dataset.t; vFotos(); }));
    $('f-up').onclick = subirFotos;
    const body = $('hb-fb');
    function draw() {
      const list = filtered(photos());
      if (fotosTab === 'album') { body.innerHTML = '<p class="hb-small" style="margin-bottom:.5rem">' + pl(list.length, 'foto', 'fotos') + '</p>' + gridHtml(list); bindGrid(body, list); return; }
      const marks = {}; list.forEach((p) => { if (p.fecha) marks[p.fecha] = String((Number(marks[p.fecha]) || 0) + 1); });
      body.innerHTML = '<div id="hb-c"></div><div id="hb-day" style="margin-top:.8rem"></div>';
      const sinFecha = list.filter((p) => !p.fecha);
      calendar($('hb-c'), marks, (k) => { const day = list.filter((p) => p.fecha === k); $('hb-day').innerHTML = '<div class="hb-card"><h3>' + fmtDate(k) + '</h3>' + gridHtml(day) + '</div>'; bindGrid($('hb-day'), day); }, {});
      if (sinFecha.length) { const x = document.createElement('div'); x.className = 'hb-card'; x.style.marginTop = '.8rem'; x.innerHTML = '<h3>Sin fecha</h3>' + gridHtml(sinFecha); body.appendChild(x); bindGrid(x, sinFecha); }
    }
    bindFilters(draw); draw();
  }
  function vFavoritos() {
    const fav = favSet(), list = photos().filter((p) => fav.has(p.archivo)), cs = D.favoritos_cartas.slice().sort();
    const tit = (k) => { const x = CD.disponibles.find((d) => d.fecha === k); return x && x.titulo ? x.titulo : 'Carta'; };
    W().innerHTML = '<div class="hb-card"><h3>♥ Fotos favoritas</h3>' + (list.length ? gridHtml(list) : '<p>Toca el ♥ en una foto para guardarla aquí.</p>') + '</div><div class="hb-card"><h3>♥ Cartas favoritas</h3>' + (cs.length ? '<div class="hb-list">' + cs.map((k) => '<button class="hb-item" data-c="' + esc(k) + '" type="button">💌 ' + esc(tit(k)) + '<small>' + fmtDate(k) + '</small></button>').join('') + '</div>' : '<p>Toca ♡ en una carta para guardarla aquí.</p>') + '</div>';
    bindGrid(W(), list); W().querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => openCarta(b.dataset.c)));
  }

  /* ---------------- Visor de fotos ---------------- */
  let vList = [], vIdx = 0;
  function openViewer(list, i) { vList = list; vIdx = i; $('hb-viewer').classList.add('on'); $('hb-viewer').setAttribute('aria-hidden', 'false'); drawViewer(); }
  function closeViewer() { $('hb-viewer').classList.remove('on'); $('hb-viewer').setAttribute('aria-hidden', 'true'); $('hb-viewer').innerHTML = ''; }
  function drawViewer() {
    const p = vList[vIdx]; if (!p) return closeViewer();
    const l = lugarById(p.lugar_id), fav = favSet().has(p.archivo);
    $('hb-viewer').innerHTML = '<div class="vtop"><span class="hb-small">' + (vIdx + 1) + ' / ' + vList.length + '</span><button class="hb-ib" id="v-x" type="button" aria-label="Cerrar">✕</button></div>' +
      '<div class="vimg" id="v-img"><img alt="' + esc(p.nota || 'Foto') + '" src="' + src(p.archivo) + '"></div>' +
      '<div class="vinfo"><div>' + (p.fecha ? '<span class="hb-chip">📅 ' + fmtDate(p.fecha) + '</span>' : '') + (l ? '<span class="hb-chip">📍 ' + esc(l.nombre) + '</span>' : '<span class="hb-chip">sin lugar</span>') + p.categorias.map((c) => '<span class="hb-chip">' + esc(c) + '</span>').join('') + '</div>' + (p.nota ? '<p style="margin-top:.4rem">' + esc(p.nota) + '</p>' : '') +
      '<div class="vrow"><button class="hb-btn" id="v-fav" type="button">' + (fav ? '♥ Quitar' : '♡ Favorita') + '</button>' + (l ? '<button class="hb-btn ghost" id="v-lug" type="button">📍 Ver el lugar</button><button class="hb-btn ghost" id="v-lf" type="button">🖼️ Fotos de este lugar</button>' : '') + '<button class="hb-btn ghost hb-adm" id="v-ed" type="button">✎ Editar</button></div></div>';
    $('v-x').onclick = closeViewer;
    $('v-fav').onclick = () => toggleFav(p.archivo);
    if (l) { $('v-lug').onclick = () => { closeViewer(); selLugar = l.id; lugaresTab = 'mapa'; goto('lugares'); }; $('v-lf').onclick = () => { closeViewer(); Object.assign(F, { desde: '', hasta: '', cat: '', fav: false, lugar: l.id }); fotosTab = 'album'; goto('fotos'); }; }
    $('v-ed').onclick = () => editFoto(p);
    const img = $('v-img'); let t0 = null;
    img.querySelector('img').addEventListener('dblclick', (e) => e.currentTarget.classList.toggle('z'));
    img.addEventListener('touchstart', (e) => { t0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    img.addEventListener('touchend', (e) => { if (t0 == null) return; const dx = e.changedTouches[0].clientX - t0; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); t0 = null; }, { passive: true });
  }
  function step(d) { vIdx = (vIdx + d + vList.length) % vList.length; drawViewer(); }
  async function toggleFav(a) {
    const on = !D.favoritos.includes(a);
    D.favoritos = on ? D.favoritos.concat(a) : D.favoritos.filter((x) => x !== a);
    try { localStorage.setItem(LS, JSON.stringify(D)); } catch (e) {}
    drawViewer();
    try { const j = await api('POST', null, { action: 'fav', archivo: a, on }); if (!j || j.ok !== true) throw new Error('x'); }
    catch (e) { D.favoritos = on ? D.favoritos.filter((x) => x !== a) : D.favoritos.concat(a); drawViewer(); toast('No se pudo guardar el favorito'); }
  }

  /* ---------------- Editar foto (admin) ---------------- */
  function editFoto(p) {
    const cats = D.categorias.slice(); p.categorias.forEach((c) => { if (cats.indexOf(c) < 0) cats.push(c); });
    modal('<h3>Editar foto</h3><p class="hb-small">' + esc(p.archivo) + '</p>' +
      '<label>Lugar<select class="hb-in" id="e-l"><option value="">— sin lugar —</option>' + D.lugares.map((l) => '<option value="' + esc(l.id) + '"' + (p.lugar_id === l.id ? ' selected' : '') + '>' + esc(l.nombre) + '</option>').join('') + '</select></label>' +
      '<label>Fecha<input class="hb-in" id="e-d" type="date" value="' + esc(p.fecha) + '"></label>' +
      '<label>Categorías</label><div class="cks" id="e-c">' + cats.map((c) => '<label><input type="checkbox" value="' + esc(c) + '"' + (p.categorias.indexOf(c) >= 0 ? ' checked' : '') + '>' + esc(c) + '</label>').join('') + '</div>' +
      '<label>Nueva categoría (opcional)<input class="hb-in" id="e-n" maxlength="30" placeholder="ej.: paseos"></label>' +
      '<label>Nota<textarea class="hb-in" id="e-t" rows="2" maxlength="300">' + esc(p.nota) + '</textarea></label><div class="err" id="e-e"></div>' +
      '<div class="row"><button class="hb-btn ghost" id="e-x" type="button">Cancelar</button><button class="hb-btn" id="e-g" type="button">Guardar</button></div><button class="hb-btn danger" id="e-del" type="button">Quitar esta foto del sitio</button>');
    $('e-x').onclick = closeModal;
    $('e-del').onclick = async () => {
      if (!confirm('¿Quitar esta foto del sitio?' + (/^drive_/.test(p.archivo) ? ' Se manda a la papelera de tu Drive.' : ' (El archivo sigue en tu carpeta fotos/; bórralo allí, vuelve a ejecutar ACTUALIZAR_FOTOS.bat y sube los cambios.)'))) return;
      closeModal(); const j = await adminPost('foto_borrar', { archivo: p.archivo });
      if (j.ok) { await load(); closeViewer(); rerender(); toast('Foto quitada'); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
    $('e-g').onclick = async () => {
      const nueva = $('e-n').value.trim().toLowerCase().replace(/,/g, '');
      const cs = Array.from($('e-c').querySelectorAll('input:checked')).map((i) => i.value); if (nueva && cs.indexOf(nueva) < 0) cs.push(nueva);
      const data = { archivo: p.archivo, lugar_id: $('e-l').value, fecha: $('e-d').value, categorias: cs, nota: $('e-t').value.trim() };
      closeModal();
      if (nueva) { const r = await adminPost('categoria_agregar', { nombre: nueva }); if (!r.ok) { if (r.error !== 'cancel') toast(errTxt(r)); return; } }
      const j = await adminPost('foto_guardar', data);
      if (j.ok) { await load(); closeViewer(); rerender(); toast('Foto guardada'); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
  }

  /* ---------------- LUGARES ---------------- */
  function placeDates(l) {
    const s = new Set(l.fechas.filter(isDate)); photos().forEach((p) => { if (p.lugar_id === l.id && isDate(p.fecha)) s.add(p.fecha); });
    return Array.from(s).sort();
  }
  function vLugares() {
    const w = W();
    w.innerHTML = '<div class="hb-tabs" role="tablist"><button class="hb-tab' + (lugaresTab === 'cal' ? ' on' : '') + '" data-t="cal" role="tab" type="button">📅 Calendario</button><button class="hb-tab' + (lugaresTab === 'mapa' ? ' on' : '') + '" data-t="mapa" role="tab" type="button">🗺️ Mapa</button></div><div style="margin-bottom:.7rem"><button class="hb-btn hb-adm" id="l-new" type="button">＋ Nuevo lugar</button></div><div id="hb-lb"></div>';
    w.querySelectorAll('.hb-tab').forEach((b) => b.addEventListener('click', () => { lugaresTab = b.dataset.t; vLugares(); }));
    $('l-new').onclick = () => editLugar(null);
    if (!D.lugares.length) { $('hb-lb').innerHTML = '<div class="hb-card"><p>Aún no hay lugares guardados. ' + (admin ? '' : 'Pronto aparecerán aquí.') + '</p></div>'; if (lugaresTab !== 'mapa') return; }
    lugaresTab === 'cal' ? lugCal() : lugMapa();
  }
  function placeCard(l) {
    const ph = photos().filter((p) => p.lugar_id === l.id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const fechas = placeDates(l);
    return '<h3>📍 ' + esc(l.nombre) + '</h3>' + (fechas.length ? '<p>' + fechas.map((f) => '<span class="hb-chip">' + fmtDate(f) + '</span>').join('') + '</p>' : '') + (l.nota ? '<p>' + esc(l.nota) + '</p>' : '') + (ph.length ? '<div class="hb-grid" style="margin-top:.5rem" id="pc-g">' + ph.slice(0, 12).map((p, i) => '<button class="hb-ph" type="button" data-i="' + i + '"><img loading="lazy" alt="" src="' + thumbSrc(p) + '"><span class="miss">Falta</span></button>').join('') + '</div><button class="hb-btn ghost" id="pc-all" type="button">🖼️ Ver todas las fotos de este lugar</button>' : '<p class="hb-small">Aún no hay fotos de este lugar.</p>') +
      '<div style="margin-top:.4rem"><button class="hb-btn ghost hb-adm" id="pc-ed" type="button">✎ Editar lugar</button></div>';
  }
  function bindPlace(host, l) {
    const ph = photos().filter((p) => p.lugar_id === l.id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).slice(0, 12);
    host.querySelectorAll('.hb-ph').forEach((b) => { b.querySelector('img').addEventListener('error', () => b.classList.add('bad')); b.addEventListener('click', () => openViewer(ph, Number(b.dataset.i))); });
    const all = host.querySelector('#pc-all'); if (all) all.onclick = () => { Object.assign(F, { desde: '', hasta: '', cat: '', fav: false, lugar: l.id }); fotosTab = 'album'; goto('fotos'); };
    const ed = host.querySelector('#pc-ed'); if (ed) ed.onclick = () => editLugar(l);
  }
  function lugCal() {
    const marks = {}; D.lugares.forEach((l) => placeDates(l).forEach((f) => { marks[f] = '📍'; }));
    $('hb-lb').innerHTML = '<div id="hb-c"></div><div id="hb-day" style="margin-top:.8rem"></div>';
    calendar($('hb-c'), marks, (k) => {
      const ls = D.lugares.filter((l) => placeDates(l).indexOf(k) >= 0);
      $('hb-day').innerHTML = '<div class="hb-card"><h3>✨ Aquí pasó algo · ' + fmtDate(k) + '</h3>' + (ls.length ? ls.map((l) => '<div class="hb-item" style="margin-bottom:.4rem"><b>' + esc(l.nombre) + '</b>' + (l.nota ? '<small>' + esc(l.nota) + '</small>' : '') + '</div>').join('') : '<p>Sin recuerdos este día.</p>') + '</div>';
      const ph = photos().filter((p) => p.fecha === k);
      if (ph.length) { const x = document.createElement('div'); x.className = 'hb-card'; x.innerHTML = '<h3>Fotos de ese día</h3>' + gridHtml(ph); $('hb-day').appendChild(x); bindGrid(x, ph); }
      ls.forEach((l) => { const b = document.createElement('button'); b.className = 'hb-btn ghost'; b.type = 'button'; b.textContent = '🗺️ ' + l.nombre + ' en el mapa'; b.onclick = () => { selLugar = l.id; lugaresTab = 'mapa'; vLugares(); }; $('hb-day').appendChild(b); });
    }, {});
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = res; s.onerror = () => rej(new Error('leaflet')); document.head.appendChild(s);
    });
  }
  let mapTok = 0;
  function lugMapa() {
    const tok = ++mapTok, host = $('hb-lb');
    host.innerHTML = (pick ? '<div class="hb-banner" id="hb-pb">📍 Toca el mapa para elegir el lugar. <button class="hb-btn ghost" id="hb-pc" type="button" style="margin:0 0 0 .5rem;padding:.2rem .7rem;color:#fff;border-color:#fff">Cancelar</button></div>' : '') +
      '<div class="hb-map-wrap"><div class="hb-list" id="hb-ll">' + D.lugares.map((l) => '<button class="hb-item' + (l.id === selLugar ? ' on' : '') + '" data-id="' + esc(l.id) + '" type="button">📍 ' + esc(l.nombre) + '<small>' + (placeDates(l).length ? fmtDate(placeDates(l)[0]) : 'sin fecha') + '</small></button>').join('') + '</div><div id="hb-map" role="application" aria-label="Mapa de lugares"></div></div><div class="hb-card" id="hb-pd" style="margin-top:.8rem;display:none"></div>';
    if (pick) $('hb-pc').onclick = () => { const d = pick; pick = null; editLugar(d.draft, true); };
    loadLeaflet().then(() => {
      if (tok !== mapTok || map || cur !== 'lugares' || !$('hb-map')) return;   // otra pintada más reciente ya se encargó
      const L = window.L; map = L.map('hb-map', { zoomControl: true, attributionControl: true }).setView([13.7, -89.2], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const pts = [];
      D.lugares.forEach((l) => { if (!isFinite(l.lat) || !isFinite(l.lng)) return; pts.push([l.lat, l.lng]);
        const mk = L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: '<div class="hb-pin">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] }), title: l.nombre, keyboard: true }).addTo(map);
        mk.on('click', () => showPlace(l.id)); markers[l.id] = mk; });
      if (pick) map.on('click', (e) => { const d = pick; pick = null; d.draft.lat = e.latlng.lat.toFixed(6); d.draft.lng = e.latlng.lng.toFixed(6); editLugar(d.draft, true); });
      else if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      if (selLugar && lugarById(selLugar)) showPlace(selLugar);
    }).catch(() => { if (tok !== mapTok || !$('hb-map') || map) return; $('hb-map').innerHTML = '<p class="hb-small" style="padding:1rem">No se pudo cargar el mapa (¿sin conexión?). La lista sigue funcionando.</p>'; });
    $('hb-ll').querySelectorAll('.hb-item').forEach((b) => b.addEventListener('click', () => showPlace(b.dataset.id)));
  }
  function showPlace(id) {
    const l = lugarById(id); if (!l) return; selLugar = id;
    $('hb-ll').querySelectorAll('.hb-item').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    if (map && isFinite(l.lat)) map.flyTo([l.lat, l.lng], Math.max(map.getZoom(), 14), { duration: .8 });
    const d = $('hb-pd'); d.style.display = 'block'; d.innerHTML = placeCard(l); bindPlace(d, l);
    if (!pick) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function editLugar(l, keep) {
    const draft = keep ? l : { id: l ? l.id : '', nombre: l ? l.nombre : '', lat: l ? String(l.lat) : '', lng: l ? String(l.lng) : '', fechas: l ? l.fechas.join(', ') : '', nota: l ? l.nota : '' };
    modal('<h3>' + (draft.id ? 'Editar lugar' : 'Nuevo lugar') + '</h3><label>Nombre<input class="hb-in" id="p-n" maxlength="80" value="' + esc(draft.nombre) + '"></label>' +
      '<div class="row"><label>Latitud<input class="hb-in" id="p-la" inputmode="decimal" value="' + esc(draft.lat) + '"></label><label>Longitud<input class="hb-in" id="p-lo" inputmode="decimal" value="' + esc(draft.lng) + '"></label></div>' +
      '<div class="row"><button class="hb-btn ghost" id="p-map" type="button">📍 Elegir en el mapa</button><button class="hb-btn ghost" id="p-gps" type="button">🎯 Mi ubicación</button></div>' +
      '<label>Fechas de visita (AAAA-MM-DD, separadas por coma)<textarea class="hb-in" id="p-f" rows="2">' + esc(draft.fechas) + '</textarea></label>' +
      '<div class="row"><input class="hb-in" id="p-fd" type="date" aria-label="Añadir fecha"><button class="hb-btn ghost" id="p-fa" type="button">Añadir fecha</button></div>' +
      '<label>Nota<textarea class="hb-in" id="p-t" rows="2" maxlength="300">' + esc(draft.nota) + '</textarea></label><div class="err" id="p-e"></div>' +
      '<div class="row"><button class="hb-btn ghost" id="p-x" type="button">Cancelar</button><button class="hb-btn" id="p-g" type="button">Guardar</button></div>' + (draft.id ? '<button class="hb-btn danger" id="p-del" type="button">Borrar lugar</button>' : ''));
    const read = () => ({ id: draft.id, nombre: $('p-n').value.trim(), lat: $('p-la').value.trim(), lng: $('p-lo').value.trim(), fechas: $('p-f').value, nota: $('p-t').value.trim() });
    $('p-x').onclick = closeModal;
    $('p-fa').onclick = () => { const v = $('p-fd').value; if (isDate(v)) { $('p-f').value = ($('p-f').value.trim() ? $('p-f').value.trim() + ', ' : '') + v; $('p-fd').value = ''; } };
    $('p-map').onclick = () => { pick = { draft: read() }; closeModal(); lugaresTab = 'mapa'; selLugar = ''; vLugares(); };
    $('p-gps').onclick = () => { if (!navigator.geolocation) { $('p-e').textContent = 'Este dispositivo no permite ubicación.'; return; } navigator.geolocation.getCurrentPosition((pos) => { $('p-la').value = pos.coords.latitude.toFixed(6); $('p-lo').value = pos.coords.longitude.toFixed(6); }, () => { $('p-e').textContent = 'No se pudo obtener la ubicación.'; }); };
    if ($('p-del')) $('p-del').onclick = async () => { if (!confirm('¿Borrar este lugar? Sus fotos quedarán sin lugar.')) return; closeModal(); const j = await adminPost('lugar_borrar', { id: draft.id }); if (j.ok) { await load(); selLugar = ''; rerender(); toast('Lugar borrado'); } else if (j.error !== 'cancel') toast(errTxt(j)); };
    $('p-g').onclick = async () => {
      const v = read(), fechas = v.fechas.split(',').map((x) => x.trim()).filter(Boolean);
      if (!v.nombre) { $('p-e').textContent = 'Escribe el nombre.'; return; }
      if (!isFinite(Number(v.lat)) || !isFinite(Number(v.lng)) || v.lat === '' || v.lng === '') { $('p-e').textContent = 'Falta la ubicación (usa el mapa o escribe latitud y longitud).'; return; }
      if (fechas.some((f) => !isDate(f))) { $('p-e').textContent = 'Revisa las fechas (AAAA-MM-DD).'; return; }
      closeModal(); const j = await adminPost('lugar_guardar', { id: v.id, nombre: v.nombre, lat: Number(v.lat), lng: Number(v.lng), fechas, nota: v.nota });
      if (j.ok) { await load(); if (j.id) selLugar = j.id; rerender(); toast('Lugar guardado'); } else if (j.error !== 'cancel') toast(errTxt(j));
    };
  }

  /* ---------------- LÍNEA DE TIEMPO ---------------- */
  function vLinea() {
    const ev = [];
    if (startParts()) ev.push({ k: D.fecha_inicio, t: 'start', txt: '💞 Comenzó nuestra historia' });
    pastAnniv().forEach((a) => ev.push({ k: a.k, t: 'an', txt: '🎂 ' + a.label + ' juntos' }));
    D.lugares.forEach((l) => placeDates(l).forEach((f) => ev.push({ k: f, t: 'lug', txt: '📍 ' + l.nombre, id: l.id })));
    const byDate = {}; photos().forEach((p) => { if (isDate(p.fecha)) (byDate[p.fecha] = byDate[p.fecha] || []).push(p); });
    Object.keys(byDate).forEach((k) => ev.push({ k, t: 'ph', txt: '🖼️ ' + pl(byDate[k].length, 'foto', 'fotos'), ph: byDate[k] }));
    D.favoritos_cartas.forEach((k) => { const x = CD.disponibles.find((d) => d.fecha === k); ev.push({ k, t: 'carta', txt: '💌 Carta favorita' + (x && x.titulo ? ': ' + x.titulo : '') }); });
    D.notas.forEach((n) => { if (isDate(n.fecha)) ev.push({ k: n.fecha, t: 'nota', txt: '💬 ' + n.texto }); });
    ev.sort((a, b) => b.k.localeCompare(a.k));
    const sinF = D.notas.filter((n) => !isDate(n.fecha));
    const notasHtml = sinF.length ? '<div class="hb-card"><h3>💬 Notas de ella</h3>' + sinF.map((n) => '<p>' + esc(n.texto) + '</p>').join('') + '</div>' : '';
    if (!ev.length) { W().innerHTML = notasHtml + '<div class="hb-card"><h3>⏳ Línea de tiempo</h3><p>Aquí irá apareciendo nuestra historia: fotos, lugares y aniversarios.</p></div>'; return; }
    let h = '<div class="hb-tl">', y = '', m = '';
    ev.forEach((e, i) => { const p = e.k.split('-'); if (p[0] !== y) { y = p[0]; m = ''; h += '<h4>' + y + '</h4>'; } if (p[1] !== m) { m = p[1]; h += '<h5>' + MES[Number(m) - 1] + '</h5>'; }
      h += '<button class="hb-ev" type="button" data-i="' + i + '"><b>' + esc(e.txt) + '</b><br><span class="hb-small">' + fmtDate(e.k) + '</span>' + (e.ph ? '<div class="th">' + e.ph.slice(0, 5).map((x) => '<img loading="lazy" alt="" src="' + thumbSrc(x) + '">').join('') + '</div>' : '') + '</button>'; });
    W().innerHTML = notasHtml + h + '</div>';
    W().querySelectorAll('.hb-ev').forEach((b) => { const e = ev[Number(b.dataset.i)]; b.querySelectorAll('img').forEach((im) => im.addEventListener('error', () => { im.style.display = 'none'; }));
      b.addEventListener('click', () => { if (e.t === 'ph') openViewer(e.ph, 0); else if (e.t === 'carta') openCarta(e.k); else if (e.t === 'lug') { selLugar = e.id; lugaresTab = 'mapa'; goto('lugares'); } }); });
  }

  /* ---------------- STOP SITE (bloqueo remoto del sitio) ---------------- */
  let sbMode = null, sbBusy = false, siteT = null, sbReason = '';
  function setSiteBlock(on) {
    const el = $('site-block'); if (!el) return;
    el.classList.toggle('on', !!on); el.setAttribute('aria-hidden', on ? 'false' : 'true');
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }
  /* j = respuesta del servidor con sitio_bloqueado (todo el sitio) y paginas_bloqueadas (por página) */
  function applyBlock(j) {
    if (!j || typeof j.sitio_bloqueado !== 'boolean') return;
    const pg = Array.isArray(j.paginas_bloqueadas) ? j.paginas_bloqueadas : [];
    sbReason = j.sitio_bloqueado ? 'sitio' : pg.indexOf(PAGE) >= 0 ? 'pagina' : '';
    setSiteBlock(!!sbReason);
  }
  function sbOpen(mode) { sbMode = mode; $('sb-q').textContent = 'Contraseña para reactivar' + (sbReason === 'pagina' ? ' esta página' : ' el sitio'); $('sb-err').textContent = ''; $('sb-key').value = ''; $('sb-pass').classList.add('on'); setTimeout(() => $('sb-key').focus(), 50); }
  function sbClose() { $('sb-pass').classList.remove('on'); sbMode = null; $('sb-key').value = ''; }
  async function sbSubmit(e) {
    e.preventDefault(); if (sbBusy || !sbMode) return;
    const clave = $('sb-key').value; if (!clave) return;
    sbBusy = true; $('sb-err').textContent = 'Enviando…';
    try {
      const body = sbReason === 'pagina' ? { action: 'bloqueo_set', alcance: 'pagina', pagina: PAGE, bloquear: false, clave } : { action: 'start_site', clave };
      const j = await api('POST', null, body);
      if (j && j.ok === true) { applyBlock(j); sbClose(); toast('Reactivado'); } else $('sb-err').textContent = ERR[j && j.error] || 'No se pudo completar.';
    } catch (err) { $('sb-err').textContent = 'Sin conexión. No se cambió nada.'; }
    sbBusy = false; $('sb-key').value = '';
  }
  async function siteCheck() {
    clearTimeout(siteT);
    if (!document.hidden) { try { applyBlock(await api('GET', { action: 'estado' })); } catch (e) {} }
    siteT = setTimeout(siteCheck, 15000 + Math.random() * 3000);
  }
  function initSiteBlock() {
    $('sb-form').addEventListener('submit', sbSubmit); $('sb-no').addEventListener('click', sbClose);
    $('sb-icon').addEventListener('dblclick', () => sbOpen('start'));
    let tap = 0; $('sb-icon').addEventListener('touchend', (e) => { const n = Date.now(); if (n - tap < 450) { e.preventDefault(); sbOpen('start'); } tap = n; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) siteCheck(); }); window.addEventListener('online', siteCheck);
    siteCheck();
  }

  /* ---------------- ADMIN y SOPORTE ---------------- */
  function onAdminMenu() { toggleNav(false); if (admin) adminPanel(); else adminLogin(); }
  function adminLogin() {
    modal('<h3>Administrador</h3><input class="hb-in" id="ad-k" type="password" inputmode="numeric" autocomplete="off" aria-label="Contraseña" placeholder="Contraseña"><div class="err" id="ad-e"></div><div class="row"><button class="hb-btn ghost" id="ad-c" type="button">Cancelar</button><button class="hb-btn" id="ad-o" type="button">Entrar</button></div>');
    const k = $('ad-k'); k.focus(); let busy = false;
    const go = async () => {
      if (busy || !k.value) return; busy = true; $('ad-e').style.color = ''; $('ad-e').textContent = 'Verificando…';
      try {
        const j = await api('POST', null, { action: 'admin_entrar', clave: k.value });
        if (j && j.ok === true) { admin = true; adminKey = k.value; ssSet('hb_admin', '1'); ssSet('hb_key', adminKey); document.body.classList.add('hb-admin'); closeModal(); toast('Modo administrador activado'); if (cur === 'pend') render(); adminPanel(); return; }
        $('ad-e').textContent = ERR[j && j.error] || 'No se pudo entrar.';
      } catch (e) { $('ad-e').textContent = 'Sin conexión. Intenta otra vez.'; }
      busy = false; k.value = '';
    };
    $('ad-o').onclick = go; k.onkeydown = (e) => { if (e.key === 'Enter') go(); }; $('ad-c').onclick = closeModal;
  }
  function adminPanel() {
    modal('<h3>🛠 Administrador</h3><p class="hb-small">Modo administrador activo. En cada sección verás los botones ✎ y ＋ para editar.</p><button class="hb-btn" id="ap-s" type="button">SOPORTE</button><button class="hb-btn" id="ap-c" type="button">📬 Correos (los dos)</button><button class="hb-btn ghost" id="ap-h" type="button">❔ Ayuda de bienvenida</button><button class="hb-btn ghost" id="ap-o" type="button">Salir del modo admin</button><button class="hb-btn ghost" id="ap-x" type="button">Cerrar</button>');
    $('ap-x').onclick = closeModal; $('ap-s').onclick = soporte; $('ap-c').onclick = adminCorreos; $('ap-h').onclick = () => { closeModal(); showHelp(); };
    $('ap-o').onclick = () => { admin = false; adminKey = ''; ssSet('hb_admin', ''); ssSet('hb_key', ''); document.body.classList.remove('hb-admin'); closeModal(); toast('Modo administrador apagado'); if (cur === 'pend') render(); };
  }
  async function soporte() {
    modal('<h3>SOPORTE</h3><p class="hb-small">Cargando…</p>');
    let st; try { st = await api('GET', { action: 'estado' }); } catch (e) { st = null; }
    if (!st || st.ok !== true) { modal('<h3>SOPORTE</h3><p>No se pudo leer el estado. Revisa tu conexión.</p><button class="hb-btn ghost" id="so-x" type="button">Cerrar</button>'); $('so-x').onclick = closeModal; return; }
    const draw = () => {
      const pg = Array.isArray(st.paginas_bloqueadas) ? st.paginas_bloqueadas : [];
      const row = (label, off, attr) => '<div class="hb-item" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;cursor:default"><span>' + (off ? '🔴' : '🟢') + ' ' + esc(label) + '<small>' + (off ? 'Bloqueada (⚠️)' : 'Activa') + '</small></span><button class="hb-btn ' + (off ? '' : 'danger') + '" ' + attr + ' type="button" style="margin:0">' + (off ? 'Activar' : 'Bloquear') + '</button></div>';
      modal('<h3>SOPORTE</h3><p class="hb-small">Bloquea una sección o todo el sitio: se muestra la pantalla ⚠️ de mantenimiento. Se reactiva con doble clic en el ⚠️ y la contraseña.</p><div class="hb-list">' + row('Página completa (todo el sitio)', !!st.sitio_bloqueado, 'data-sitio="1"') + PAGES.filter((p) => !p[4]).map((p) => row(p[2] + ' ' + p[3], pg.indexOf(p[0]) >= 0, 'data-p="' + p[0] + '"')).join('') + '</div><div class="err" id="so-e"></div><button class="hb-btn ghost" id="so-x" type="button">Cerrar</button>');
      $('so-x').onclick = closeModal;
      $('hb-modal').querySelectorAll('button[data-sitio], button[data-p]').forEach((b) => b.addEventListener('click', async () => {
        const esSitio = !!b.dataset.sitio, id = b.dataset.p, off = esSitio ? !!st.sitio_bloqueado : pg.indexOf(id) >= 0;
        if (!off && !confirm(esSitio ? '¿Bloquear TODO el sitio ahora?' : '¿Bloquear esta sección ahora?')) return;
        const r = await adminPost('bloqueo_set', esSitio ? { alcance: 'sitio', bloquear: !off } : { alcance: 'pagina', pagina: id, bloquear: !off });
        if (r.ok) { st = Object.assign({}, st, r); applyBlock(r); draw(); toast(off ? 'Activada ✓' : 'Bloqueo enviado a la nube'); }
        else { draw(); if (r.error !== 'cancel') { const e = $('so-e'); if (e) e.textContent = errTxt(r); } }
      }));
    };
    draw();
  }

  /* ---------------- Ayuda y arranque ---------------- */
  function showHelp() { $('hb-help').classList.add('on'); $('hb-help-ok').focus(); }
  function hideHelp() { $('hb-help').classList.remove('on'); try { localStorage.setItem('hub_visto', '1'); } catch (e) {} }

  const HUB_HTML = `<div id="hub" class="on" role="main">
    <div class="hb-head">
      <button class="hb-ib" id="hb-burger" type="button" aria-label="Menú" aria-expanded="false">☰</button>
      <h2 id="hb-title">Inicio</h2>
      <a class="hb-ib" id="hb-close" href="index.html" aria-label="Inicio">🏠</a>
    </div>
    <nav class="hb-nav" id="hb-nav" aria-label="Secciones"></nav>
    <div class="hb-scrim" id="hb-scrim"></div>
    <div id="hb-view" tabindex="-1"></div>
  </div>
  <div id="hb-viewer" role="dialog" aria-label="Foto" aria-hidden="true"></div>
  <div id="hb-letter" role="dialog" aria-label="Carta" aria-hidden="true"></div>
  <div id="hb-modal" role="dialog" aria-modal="true"></div>
  <div id="hb-help" role="dialog" aria-modal="true" aria-label="Ayuda"><div class="hbox">
    <h3>Bienvenida, mi amor</h3>
    <ul>
      <li>☰ <b>El menú</b> (arriba a la izquierda) te lleva a cada sección: lugares, fotos, fechas y cartas.</li>
      <li>🎁 <b>El regalo y el calendario</b> están en su propia página (el botón de arriba a la derecha).</li>
      <li>📍 En <b>Lugares</b> verás dónde hemos estado, en calendario o en mapa.</li>
      <li>🖼️ En <b>Fotos</b> toca una para verla grande y marca con ♥ tus favoritas.</li>
      <li>📅 En <b>Fechas</b> pon tu correo para que te avisemos de cada fecha especial.</li>
    </ul>
    <button class="hb-btn" id="hb-help-ok" type="button">Entendido ❤️</button>
  </div></div>
  <div id="site-block" role="alert" aria-hidden="true">
    <button id="sb-icon" type="button" aria-label="Aviso">⚠️</button>
    <h1 id="sb-title">SITIO EN MANTENIMIENTO</h1>
    <p id="sb-sub">SISTEMA BLOQUEADO, POR FAVOR NO UTILIZAR.</p>
    <p id="sb-msg">Hola preciosa, estoy reparando o añadiendo cosas al sitio; está listo en un momento. TE AMO ❤️</p>
  </div>
  <div id="sb-pass"><form class="box" id="sb-form" autocomplete="off">
    <p id="sb-q">Contraseña</p>
    <input id="sb-key" type="password" inputmode="numeric" autocomplete="off" />
    <div id="sb-err"></div>
    <div class="row"><button type="button" id="sb-no">Cancelar</button><button type="submit" id="sb-ok">Aceptar</button></div>
  </form></div>
  <div id="r12-toast" role="status" aria-live="polite"></div>`;

  function init() {
    document.body.insertAdjacentHTML('beforeend', HUB_HTML);
    buildNav();
    const right = $('hb-close');
    if (PAGE === 'home') { right.href = 'regalo.html'; right.textContent = '🎁'; right.setAttribute('aria-label', 'Regalo y calendario'); }
    else { right.href = 'index.html'; right.textContent = '🏠'; right.setAttribute('aria-label', 'Inicio'); }
    document.body.classList.toggle('hb-admin', admin);
    new MutationObserver(queueHydrate).observe($('hub'), { childList: true, subtree: true });
    new MutationObserver(queueHydrate).observe($('hb-viewer'), { childList: true, subtree: true });
    $('hb-burger').addEventListener('click', () => toggleNav(!$('hb-nav').classList.contains('on')));
    $('hb-scrim').addEventListener('click', () => toggleNav(false));
    $('hb-help-ok').addEventListener('click', hideHelp);
    $('hb-modal').addEventListener('click', (e) => { if (e.target === $('hb-modal')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if ($('hb-modal').classList.contains('on')) closeModal(); else if ($('hb-letter').classList.contains('on')) closeCarta(); else if ($('hb-viewer').classList.contains('on')) closeViewer(); else if ($('hb-help').classList.contains('on')) hideHelp(); else if ($('hb-nav').classList.contains('on')) toggleNav(false); }
      else if ($('hb-viewer').classList.contains('on')) { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }
    });
    render();
    initSiteBlock();
    const first = Promise.all([load(), loadCartas(), loadLista()]);
    let hayCache = false; try { hayCache = !!localStorage.getItem(LS); } catch (e) {}
    const introOn = PAGE === 'home' && $('intro-cal') && !$('intro-cal').classList.contains('gone');
    if (!hayCache && !introOn && window.HBusy) window.HBusy.run('Cargando nuestro rincón…', () => first);
    first.then(() => { if (!pick && !$('hb-modal').classList.contains('on') && !$('hb-letter').classList.contains('on') && !$('hb-viewer').classList.contains('on')) rerender(); });
    if (PAGE === 'home') {   // la ayuda de primera vez sale cuando termina la animación de entrada
      let seen = false; try { seen = localStorage.getItem('hub_visto') === '1'; } catch (e) {}
      if (!seen) {
        const intro = $('intro-cal');
        if (!intro || intro.classList.contains('gone')) showHelp();
        else { const mo = new MutationObserver(() => { if (intro.classList.contains('gone')) { mo.disconnect(); setTimeout(showHelp, 300); } }); mo.observe(intro, { attributes: true, attributeFilter: ['class'] }); }
      }
    }
  }
  init();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
})();
