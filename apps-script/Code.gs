/**
 * ============================================================================
 *  BACKEND DE LA SORPRESA 12/12  ·  Google Apps Script + Google Sheets
 * ============================================================================
 *  - Script LIGADO a la hoja de cálculo (Extensiones → Apps Script).
 *  - Se publica como Aplicación web (ver GUIA_12-12.md).
 *  - La página pública SOLO puede:   GET ?action=estado   → ¿está habilitado?
 *                                    GET ?action=carta    → la carta (solo si está habilitado)
 *  - Cambiar el estado exige POST con la clave de administrador, que se valida AQUÍ,
 *    en el servidor. La clave vive en "Propiedades de la secuencia de comandos"
 *    (ADMIN_KEY): nunca en el HTML, nunca en el JavaScript público.
 *  - La carta se guarda en la hoja CARTA_12 y NO viaja en el HTML: mientras el 12
 *    esté bloqueado, nadie puede leerla manipulando el navegador.
 * ============================================================================
 */

// ----------------------------- Nombres y ajustes -----------------------------
var HOJA_CONFIG = 'CONFIGURACION';
var HOJA_EVENTOS = 'EVENTOS';
var HOJA_CARTA = 'CARTA_12';
var HOJA_REGISTRO = 'REGISTRO';
var HOJA_LUGARES = 'LUGARES';        // id | nombre | lat | lng | fechas | nota
var HOJA_FOTOS = 'FOTOS';            // archivo | lugar_id | fecha | categorias | nota | miniatura (id de Drive)
var HOJA_CATEGORIAS = 'CATEGORIAS';  // nombre
var HOJA_FAVORITOS = 'FAVORITOS';    // tipo | id | fecha
var MAX_FAVORITOS = 800;
var HOJA_FECHAS = 'FECHAS';          // id | titulo | fecha | nota | repite | avisar | dias_antes
var HOJA_CORREOS = 'CORREOS';        // rol (yo|ella) | correo
var HOJA_CARTAS = 'CARTAS';          // fecha | titulo | texto
var HOJA_PEND = 'PENDIENTES';        // id | tipo | texto | drive_id | lugar_id | fecha | categoria | creado | estado
var CARTAS_INICIO = '2026-12-13';   // primera carta diaria (las cartas de 2027 siguen hasta CARTAS_FIN)
var CARTAS_FIN = '2027-12-31';
var CARTAS_MIN = '2026-01-01';        // límites de seguridad al guardar/importar una carta
var CARTAS_MAX = '2030-12-31';
var MAX_UPLOAD = 900000;             // tamaño máximo del POST de una foto (base64)
var MAX_FOTO_BYTES = 700000;         // tamaño máximo de la foto ya decodificada
var MAX_PENDIENTES = 40;
var ZONA = 'America/El_Salvador';

var CACHE_ESTADO_SEG = 5;        // el estado público se cachea unos segundos (protege la cuota)
var MAX_FALLOS = 5;              // intentos de clave erróneos permitidos...
var VENTANA_FALLOS_SEG = 900;    // ...dentro de esta ventana; luego se bloquea el panel ese tiempo
var MAX_BODY = 9000;             // tamaño máximo aceptado en un POST

var MENSAJE_BLOQUEO_DEFECTO = 'Espera un poquito... todavía falta algo. ❤️';

// Texto de la sorpresa (solo se usa para rellenar la hoja CARTA_12 la primera vez;
// después puedes editarlo directamente en la hoja).
var CARTA_DEFECTO = {
  titulo: 'Quizá...',
  parrafos: [
    'Quizá desde que comenzamos a hablar, la conexión entre nosotros no tardó en llegar. Quizá ninguno de los dos imaginaba hasta dónde nos llevaría aquella primera conversación.',
    'No voy a olvidar el primer día que nos vimos, tampoco nuestro primer beso, ni aquellos largos días y noches en los que podíamos pasar horas hablando sin cansarnos. Son recuerdos que guardo con muchísimo cariño y que, si pudiera, volvería a vivir una y mil veces.',
    'Sé que todavía puedes sentir incertidumbre, y es completamente normal. No pretendo que tengas todas las respuestas ni que dejes de tener miedo. Sé que construir una vida juntos es algo grande y que requiere tiempo, paciencia, comprensión y, sobre todo, amor.',
    'Pero hay algo de lo que estoy seguro: no me imagino a ninguna otra mujer a mi lado que no seas tú.',
    'No quiero prometerte que todos nuestros días serán perfectos, porque sé que habrá dificultades, desacuerdos y momentos en los que las cosas no serán sencillas. Pero sí quiero prometerte que mi intención es elegirte incluso en esos días, escucharte, comprenderte, respetarte y seguir construyendo contigo.',
    'Quiero ser esa persona con la que puedas compartir tus alegrías, tus tristezas, tus sueños y hasta tus pequeños momentos cotidianos. Quiero conocer cada versión de ti, acompañarte en tus metas, celebrar tus logros y sostener tu mano cuando sientas que el mundo pesa demasiado.',
    'No quiero que seas solamente parte de mis mejores recuerdos; quiero que seas parte de mis próximos capítulos. Quiero que algún día podamos mirar atrás y recordar cómo comenzó todo, cuánto hemos crecido y todo lo que logramos construir juntos.',
    'No sé qué nos tenga preparado el futuro, pero sé lo que deseo para él: que sigamos caminando juntos, que nunca perdamos las ganas de enamorarnos el uno del otro y que, con el paso de los años, sigamos encontrando razones para elegirnos.',
    'Porque si algo tengo claro es que no solamente quiero compartir contigo un noviazgo, quiero construir una vida a tu lado.',
    'Gracias por esta bendición y por permitirme ser tu novio. ❤️'
  ],
  cierre: 'Ahora sí... creo que ya puedo cambiar mi estado de GitHub a comprometido: en una relación. JAJAJA. ❤️'
};

// =============================== PUNTOS DE ENTRADA ===============================

/** Consultas públicas (solo lectura). */
function doGet(e) {
  try {
    var accion = e && e.parameter && e.parameter.action ? String(e.parameter.action) : '';
    if (accion === 'estado') return json_(estadoPublico_());
    if (accion === 'carta') return json_(cartaPublica_());
    if (accion === 'hub') return json_(hubPublico_());
    if (accion === 'cartas_dias') return json_(cartasDias_());
    if (accion === 'carta_dia') return json_(cartaDia_(String(e.parameter.fecha || '')));
    if (accion === 'ir') return irAlSitio_();
    if (accion === 'capsula_abrir') return json_(capsulaAbrir_(String(e.parameter.id || '')));
    if (accion === 'aniv_carta') return json_(anivCarta_(e.parameter.n));
    if (accion === 'foto_drive') return json_(fotoDrive_(String(e.parameter.id || ''), false));
    return json_({ ok: false, error: 'accion' });
  } catch (err) {
    console.error('doGet: ' + err);
    return json_({ ok: false, error: 'interno' });
  }
}

/** Operaciones administrativas (requieren clave validada en el servidor). */
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw || raw.length > MAX_UPLOAD) return json_({ ok: false, error: 'formato' });
    var datos;
    try { datos = JSON.parse(raw); } catch (x) { return json_({ ok: false, error: 'formato' }); }
    if (!datos || typeof datos !== 'object') return json_({ ok: false, error: 'formato' });

    var accion = String(datos.action || '');
    if (raw.length > MAX_BODY && accion !== 'pend_foto' && accion !== 'foto_subir') return json_({ ok: false, error: 'formato' });
    if (accion === 'stop_site' || accion === 'start_site') return json_(cambiarSitio_(accion, String(datos.clave || '')));
    if (accion === 'admin_entrar' || accion === 'bloqueo_set') return json_(soporte_(accion, datos));
    var hubRes = hubPost_(accion, datos);
    if (hubRes) return json_(hubRes);
    if (accion !== 'habilitar' && accion !== 'bloquear') return json_({ ok: false, error: 'accion' });
    return json_(cambiarEstado_(accion, String(datos.clave || '')));
  } catch (err) {
    console.error('doPost: ' + err);
    return json_({ ok: false, error: 'interno' });
  }
}

// ================================ LÓGICA PÚBLICA ================================

function estadoPublico_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('estado_v1');
  if (hit) { try { return JSON.parse(hit); } catch (x) { /* se recalcula */ } }
  var cfg = leerConfig_();
  var out = {
    ok: true,
    habilitado_12: esVerdadero_(cfg.habilitado_12),
    sitio_bloqueado: esVerdadero_(cfg.sitio_bloqueado),
    paginas_bloqueadas: listaPaginas_(cfg.paginas_bloqueadas),
    mensaje_bloqueo: String(cfg.mensaje_bloqueo || MENSAJE_BLOQUEO_DEFECTO),
    actualizado: String(cfg.ultima_actualizacion || '')
  };
  cache.put('estado_v1', JSON.stringify(out), CACHE_ESTADO_SEG);
  return out;
}

/** La carta SOLO se entrega si el 12 está habilitado (se lee siempre de la hoja, sin caché). */
function cartaPublica_() {
  var cfg = leerConfig_();
  if (!esVerdadero_(cfg.habilitado_12)) return { ok: true, habilitado_12: false };
  var filas = hoja_(HOJA_CARTA).getDataRange().getValues();
  var titulo = '', cierre = '', parrafos = [], orden = [];
  for (var i = 1; i < filas.length; i++) {
    var tipo = String(filas[i][1]).trim().toLowerCase();
    var texto = String(filas[i][2]);
    if (!texto) continue;
    if (tipo === 'titulo') titulo = texto;
    else if (tipo === 'cierre') cierre = texto;
    else if (tipo === 'parrafo') orden.push({ n: Number(filas[i][0]) || (i * 1000), t: texto });
  }
  orden.sort(function (a, b) { return a.n - b.n; });
  parrafos = orden.map(function (o) { return o.t; });
  return { ok: true, habilitado_12: true, titulo: titulo, parrafos: parrafos, cierre: cierre };
}

// ============================ OPERACIÓN ADMINISTRATIVA ============================

function cambiarEstado_(accion, clave) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: 'ocupado' };
  try {
    var no = autorizarAdmin_(accion, clave);     // acepta SITE_KEY (3457 por defecto), ADMIN_KEY o la clave de ella
    if (no) return no;
    return aplicarSorpresa_(accion === 'habilitar');
  } finally {
    lock.releaseLock();
  }
}
/** Habilita o bloquea la sorpresa del 12 (única cosa que se bloquea/desbloquea a mano; las cartas diarias salen solas por fecha). */
function aplicarSorpresa_(habilitar) {
  var ahora = marca_();
  escribirConfig_('habilitado_12', habilitar ? 'TRUE' : 'FALSE');
  escribirConfig_('ultima_actualizacion', ahora);
  escribirConfig_('fecha_activacion', habilitar ? ahora : '');
  actualizarEvento_(habilitar ? 'HABILITADO' : 'BLOQUEADO', ahora);
  CacheService.getScriptCache().remove('estado_v1');
  registrar_(habilitar ? 'habilitar' : 'bloquear', 'OK (' + ROL_ + ')');
  return { ok: true, habilitado_12: habilitar, actualizado: ahora };
}

// ============================ BLOQUEO GENERAL DEL SITIO ============================
/**
 * "Stop site" / reactivar. Se valida en el servidor con la clave SITE_KEY
 * (Propiedades de la secuencia de comandos). Si no existe, se usa '3457'.
 * Comparte el límite de intentos fallidos con el resto del panel.
 */
function cambiarSitio_(accion, clave) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: 'ocupado' };
  try {
    var cache = CacheService.getScriptCache();
    var esperada = PropertiesService.getScriptProperties().getProperty('SITE_KEY') || '3457';

    var fallos = Number(cache.get('fallos') || 0);
    if (fallos >= MAX_FALLOS) { registrar_(accion, 'RECHAZADO: bloqueo temporal'); return { ok: false, error: 'bloqueado' }; }

    if (!clave || !iguales_(clave, esperada)) {
      cache.put('fallos', String(fallos + 1), VENTANA_FALLOS_SEG);
      registrar_(accion, 'RECHAZADO: clave incorrecta (' + (fallos + 1) + '/' + MAX_FALLOS + ')');
      Utilities.sleep(700);
      return { ok: false, error: 'clave' };
    }
    cache.remove('fallos');

    var parar = accion === 'stop_site';
    var ahora = marca_();
    escribirConfig_('sitio_bloqueado', parar ? 'TRUE' : 'FALSE');
    escribirConfig_('ultima_actualizacion', ahora);
    cache.remove('estado_v1');
    registrar_(accion, 'OK');
    return { ok: true, sitio_bloqueado: parar, paginas_bloqueadas: listaPaginas_(leerConfig_().paginas_bloqueadas), habilitado_12: esVerdadero_(leerConfig_().habilitado_12), actualizado: ahora };
  } finally {
    lock.releaseLock();
  }
}

// ================================== UTILIDADES ==================================

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function esVerdadero_(v) { return String(v).trim().toUpperCase() === 'TRUE'; }
function marca_() { return Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd'T'HH:mm:ssXXX"); }

function digest_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8); }
/** Comparación en tiempo constante (sobre los hashes SHA-256). */
function iguales_(a, b) {
  var da = digest_(a), db = digest_(b), d = 0;
  for (var i = 0; i < da.length; i++) d |= (da[i] ^ db[i]);
  return d === 0;
}

function libro_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');   // solo si el script NO está ligado a la hoja
  if (!id) throw new Error('No hay hoja de cálculo asociada (define SHEET_ID).');
  return SpreadsheetApp.openById(id);
}
function hoja_(nombre) {
  var sh = libro_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja ' + nombre + ' (ejecuta inicializar()).');
  return sh;
}

function leerConfig_() {
  var v = hoja_(HOJA_CONFIG).getDataRange().getValues(), o = {};
  for (var i = 1; i < v.length; i++) { var k = String(v[i][0]).trim(); if (k) o[k] = v[i][1]; }
  return o;
}
function escribirConfig_(clave, valor) {
  var sh = hoja_(HOJA_CONFIG), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === clave) { sh.getRange(i + 1, 2).setValue(valor); return; }
  }
  sh.appendRow([clave, valor]);
}
function actualizarEvento_(estado, ahora) {
  var sh = hoja_(HOJA_EVENTOS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).trim() === '12/12') { sh.getRange(i + 1, 3).setValue(estado); sh.getRange(i + 1, 5).setValue(ahora); return; }
  }
  sh.appendRow([v.length, '12/12', estado, 'Sorpresa especial', ahora]);
}
/** Bitácora de operaciones administrativas (nunca guarda la clave). */
function registrar_(accion, resultado) {
  try { hoja_(HOJA_REGISTRO).appendRow([marca_(), accion, resultado]); } catch (x) { console.error('registro: ' + x); }
}

// ============================ CONFIGURACIÓN INICIAL ============================
/**
 * Ejecuta esta función UNA vez desde el editor (▶ Ejecutar → inicializar).
 * Crea las hojas y las rellena. Es seguro repetirla: no pisa datos que ya existan,
 * y NUNCA cambia el valor de habilitado_12.
 */
function inicializar() {
  var ss = libro_();
  function obtener(nombre) { return ss.getSheetByName(nombre) || ss.insertSheet(nombre); }

  var cfg = obtener(HOJA_CONFIG);
  if (cfg.getLastRow() === 0) cfg.appendRow(['Parámetro', 'Valor']);
  cfg.getRange('B:B').setNumberFormat('@');            // texto plano: evita que Sheets convierta fechas/TRUE
  var existentes = leerConfig_();
  var base = [
    ['fecha_especial', '12/12'],
    ['habilitado_12', 'FALSE'],
    ['sitio_bloqueado', 'FALSE'],
    ['paginas_bloqueadas', ''],
    ['mensaje_bloqueo', MENSAJE_BLOQUEO_DEFECTO],
    ['ultima_actualizacion', ''],
    ['fecha_activacion', '']
  ];
  base.forEach(function (par) { if (!(par[0] in existentes)) cfg.appendRow(par); });
  cfg.setFrozenRows(1);

  var ev = obtener(HOJA_EVENTOS);
  if (ev.getLastRow() === 0) { ev.appendRow(['ID', 'Fecha', 'Estado', 'Descripción', 'Actualizado']); ev.appendRow([1, '12/12', 'BLOQUEADO', 'Sorpresa especial', '']); }
  ev.setFrozenRows(1);

  var carta = obtener(HOJA_CARTA);
  if (carta.getLastRow() === 0) {
    carta.appendRow(['Orden', 'Tipo', 'Texto']);
    carta.appendRow([0, 'titulo', CARTA_DEFECTO.titulo]);
    CARTA_DEFECTO.parrafos.forEach(function (p, i) { carta.appendRow([i + 1, 'parrafo', p]); });
    carta.appendRow([99, 'cierre', CARTA_DEFECTO.cierre]);
  }
  carta.setFrozenRows(1);

  // ---- Hojas del hub (lugares, fotos, categorías, favoritos) ----
  var lug = obtener(HOJA_LUGARES);
  if (lug.getLastRow() === 0) lug.appendRow(['id', 'nombre', 'lat', 'lng', 'fechas', 'nota']);
  lug.getRange('A:F').setNumberFormat('@'); lug.setFrozenRows(1);
  var fot = obtener(HOJA_FOTOS);
  if (fot.getLastRow() === 0) fot.appendRow(['archivo', 'lugar_id', 'fecha', 'categorias', 'nota']);
  if (String(fot.getRange(1, 6).getValue()) !== 'miniatura') fot.getRange(1, 6).setValue('miniatura');
  fot.getRange('A:F').setNumberFormat('@'); fot.setFrozenRows(1);
  var cat = obtener(HOJA_CATEGORIAS);
  if (cat.getLastRow() === 0) { cat.appendRow(['nombre']); CATEGORIAS_DEFECTO.forEach(function (c) { cat.appendRow([c]); }); }
  cat.setFrozenRows(1);
  var fav = obtener(HOJA_FAVORITOS);
  if (fav.getLastRow() === 0) fav.appendRow(['tipo', 'id', 'fecha']);
  fav.getRange('A:C').setNumberFormat('@'); fav.setFrozenRows(1);
  var cfg2 = leerConfig_();
  if (!('fecha_inicio' in cfg2)) cfg.appendRow(['fecha_inicio', '']);   // formato AAAA-MM-DD

  // ---- Fase 2: fechas, correos, cartas 2027, pendientes ----
  var fe = obtener(HOJA_FECHAS);
  if (fe.getLastRow() === 0) fe.appendRow(['id', 'titulo', 'fecha', 'nota', 'repite', 'avisar', 'dias_antes']);
  fe.getRange('A:G').setNumberFormat('@'); fe.setFrozenRows(1);
  var co = obtener(HOJA_CORREOS);
  if (co.getLastRow() === 0) { co.appendRow(['rol', 'correo']); co.appendRow(['yo', '']); co.appendRow(['ella', '']); }
  co.getRange('A:B').setNumberFormat('@'); co.setFrozenRows(1);
  var ca = obtener(HOJA_CARTAS);
  if (ca.getLastRow() === 0) {
    ca.appendRow(['fecha', 'titulo', 'texto']);
    ca.getRange('A:C').setNumberFormat('@');
    var filasC = [], t0 = Date.UTC(2027, 0, 1);
    for (var q = 0; q < 365; q++) filasC.push([Utilities.formatDate(new Date(t0 + q * 86400000), 'UTC', 'yyyy-MM-dd'), '', '']);
    ca.getRange(2, 1, filasC.length, 3).setValues(filasC);
  }
  ca.setFrozenRows(1);
  var pe = obtener(HOJA_PEND);
  if (pe.getLastRow() === 0) pe.appendRow(['id', 'tipo', 'texto', 'drive_id', 'lugar_id', 'fecha', 'categoria', 'creado', 'estado']);
  pe.getRange('A:I').setNumberFormat('@'); pe.setFrozenRows(1);
  var cfg3 = leerConfig_();
  if (!('aniversarios_correo' in cfg3)) cfg.appendRow(['aniversarios_correo', 'TRUE']);
  if (!('dias_antes' in cfg3)) cfg.appendRow(['dias_antes', '1']);

  var reg = obtener(HOJA_REGISTRO);
  if (reg.getLastRow() === 0) reg.appendRow(['Fecha y hora', 'Acción', 'Resultado']);
  reg.setFrozenRows(1);

  verificarConfiguracion();
}

/** Revisa que todo esté listo (no imprime la clave). */
function verificarConfiguracion() {
  var tieneClave = !!PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  var cfg = leerConfig_();
  console.log('ADMIN_KEY configurada: ' + (tieneClave ? 'SÍ' : 'NO  ← añádela en Configuración del proyecto → Propiedades de la secuencia de comandos'));
  console.log('habilitado_12 = ' + cfg.habilitado_12);
  console.log('Hojas: ' + libro_().getSheets().map(function (s) { return s.getName(); }).join(', '));
}


// ============================ HUB: LUGARES · FOTOS · FAVORITOS ============================
var CATEGORIAS_DEFECTO = ['besos', 'abrazos', 'mimos', 'sonrisas', 'momentos'];

function filas_(nombre) {
  var sh = hoja_(nombre);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
}
/** Convierte a número una coordenada que puede venir como número, "13.49" o "13,49" (hoja con configuración regional en español). */
function coord_(v, max) {
  var n;
  if (typeof v === 'number') n = v;
  else {
    var t = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (t === '') return NaN;
    if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');          // 13,49 -> 13.49
    else t = t.replace(/,/g, '');                                  // 1,234.5 -> 1234.5
    n = Number(t);
  }
  if (!isFinite(n)) return NaN;
  // Sheets en español puede quitar el punto decimal (13.507507 -> 13507507): se repone dividiendo hasta entrar en rango.
  if (max) { var g = 0; while (Math.abs(n) > max && g++ < 12) n = n / 10; }
  return Math.round(n * 1e7) / 1e7;
}
/** Filas de LUGARES con latitud y longitud leídas como valores reales. */
function filasLugares_() {
  var sh = hoja_(HOJA_LUGARES);
  if (sh.getLastRow() < 2) return [];
  var n = sh.getLastRow() - 1, cols = sh.getLastColumn();
  var vis = sh.getRange(2, 1, n, cols).getDisplayValues(), raw = sh.getRange(2, 3, n, 2).getValues();
  for (var i = 0; i < n; i++) { vis[i][2] = coord_(raw[i][0], 90); vis[i][3] = coord_(raw[i][1], 180); }
  return vis;
}
function texto_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function fechaOk_(f) { return /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T00:00:00Z').getTime()); }
function archivoOk_(a) { return /^[\w\-. ()]{1,80}$/.test(a) && a.indexOf('..') < 0; }

/** Todo lo que la sección pública necesita en una sola lectura (se cachea unos segundos). */
function hubPublico_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('hub_v1');
  if (hit) { try { return JSON.parse(hit); } catch (x) { /* se recalcula */ } }
  var cfg = leerConfig_();
  var out = {
    ok: true,
    fecha_inicio: String(cfg.fecha_inicio || ''),
    categorias: filas_(HOJA_CATEGORIAS).map(function (r) { return r[0]; }).filter(String),
    lugares: filasLugares_().filter(function (r) { return r[0]; }).map(function (r) {
      return { id: r[0], nombre: r[1], estado: r[6] === 'por_visitar' ? 'por_visitar' : 'visitado', lat: r[2], lng: r[3], fechas: String(r[4]).split(',').map(function (x) { return x.trim(); }).filter(String), nota: r[5] };
    }),
    fotos: filas_(HOJA_FOTOS).filter(function (r) { return r[0]; }).map(function (r) {
      return { archivo: r[0], lugar_id: r[1], fecha: r[2], categorias: String(r[3]).split(',').map(function (x) { return x.trim(); }).filter(String), nota: r[4], miniatura: r[5] || '' };
    }),
    favoritos: filas_(HOJA_FAVORITOS).filter(function (r) { return r[0] === 'foto'; }).map(function (r) { return r[1]; }),
    favoritos_cartas: filas_(HOJA_FAVORITOS).filter(function (r) { return r[0] === 'carta'; }).map(function (r) { return r[1]; }),
    fechas: filas_(HOJA_FECHAS).filter(function (r) { return r[0]; }).map(function (r) {
      return { id: r[0], titulo: r[1], fecha: r[2], nota: r[3], repite: esVerdadero_(r[4]), avisar: r[5], dias_antes: Number(r[6]) || 1 };
    }),
    notas: filas_(HOJA_PEND).filter(function (r) { return r[1] === 'nota' && r[8] === 'aprobado'; }).map(function (r) {
      return { id: r[0], texto: r[2], lugar_id: r[4], fecha: r[5] };
    }),
    aniversarios_correo: esVerdadero_(cfg.aniversarios_correo),
    correo_enlace: esVerdadero_(cfg.correo_enlace),
    habilitado_12: esVerdadero_(cfg.habilitado_12),
    fn: funciones_(cfg),
    tema: ['auto', 'clasico', 'navidad', 'sanvalentin', 'doce'].indexOf(String(cfg.tema)) >= 0 ? String(cfg.tema) : 'auto',
    correo_tema: String(cfg.correo_tema || 'oscuro'),
    carta_correo_a: String(cfg.carta_correo_a || 'ella'),
    metas: metasPublicas_(),
    capsulas: capsulasPublicas_(),
    canciones: cancionesPublicas_(),
    correo_ella_edita: cfg.correo_ella_edita === undefined ? true : esVerdadero_(cfg.correo_ella_edita),
    dias_antes: Number(cfg.dias_antes) || 1
  };
  try { cache.put('hub_v1', JSON.stringify(out), 20); } catch (x) { /* demasiado grande: sin caché */ }
  return out;
}

/** Valida la clave de administrador (ADMIN_KEY o SITE_KEY, por defecto 3457) con el mismo límite de intentos. */
var ROL_ = 'yo';
var SOLO_DUENO_ = { ella_admin_leer: 1, ella_admin_set: 1 };
function autorizarAdmin_(accion, clave) {
  var cache = CacheService.getScriptCache(), props = PropertiesService.getScriptProperties();
  var admin = props.getProperty('ADMIN_KEY'), sitio = props.getProperty('SITE_KEY') || '3457', ellaKey = props.getProperty('ELLA_KEY');
  var fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_FALLOS) { registrar_(accion, 'RECHAZADO: bloqueo temporal'); return { ok: false, error: 'bloqueado' }; }
  var okDueno = !!clave && ((admin && iguales_(clave, admin)) || iguales_(clave, sitio));
  var okElla = false;
  if (!okDueno && clave && ellaKey) { try { okElla = esVerdadero_(leerConfig_().ella_admin) && iguales_(clave, ellaKey); } catch (x) {} }
  if (!okDueno && !okElla) {
    cache.put('fallos', String(fallos + 1), VENTANA_FALLOS_SEG);
    registrar_(accion, 'RECHAZADO: clave incorrecta (' + (fallos + 1) + '/' + MAX_FALLOS + ')');
    Utilities.sleep(700);
    return { ok: false, error: 'clave' };
  }
  if (okElla && SOLO_DUENO_[accion]) return { ok: false, error: 'no' };
  ROL_ = okDueno ? 'yo' : 'ella';
  cache.remove('fallos');
  return null;
}

/** Acceso de ella al modo administrador (solo lo cambia el dueño). */
function ellaAdminLeer_() {
  return { ok: true, activo: esVerdadero_(leerConfig_().ella_admin), tiene_clave: !!PropertiesService.getScriptProperties().getProperty('ELLA_KEY') };
}
function ellaAdminSet_(d) {
  var props = PropertiesService.getScriptProperties();
  if ('clave_ella' in d && String(d.clave_ella) !== '') {
    var k = String(d.clave_ella);
    if (k.length < 4 || k.length > 40) return { ok: false, error: 'datos' };
    if (k === (props.getProperty('SITE_KEY') || '3457') || k === props.getProperty('ADMIN_KEY')) return { ok: false, error: 'datos' };
    props.setProperty('ELLA_KEY', k);
  }
  if ('activo' in d) {
    if (d.activo && !props.getProperty('ELLA_KEY')) return { ok: false, error: 'sin-clave' };
    escribirConfig_('ella_admin', d.activo ? 'TRUE' : 'FALSE');
  }
  return { ok: true };
}

/** Saca [lat, lng] de un enlace de Google Maps (o null). */
function coordsDeUrl_(u) {
  var t = String(u || ''); try { t = decodeURIComponent(t.replace(/\+/g, ' ')); } catch (e) {}
  var m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t) || /[?&](?:q|ll|query|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t);
  if (!m) m = /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/.exec(t);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function hostMapasOk_(u) {
  var m = /^https:\/\/([a-z0-9.\-]+)(\/[^\s]*)?$/i.exec(String(u || ''));
  if (!m) return false;
  var h = m[1].toLowerCase(), path = m[2] || '/';
  if (h === 'maps.app.goo.gl') return true;
  if (h === 'goo.gl') return /^\/maps/.test(path);
  if (h === 'maps.google.com') return true;
  return (h === 'www.google.com' || h === 'google.com') && /^\/maps/.test(path);
}
/** Sigue (con límite) las redirecciones de un enlace corto de Google Maps y devuelve las coordenadas. Solo hosts de Google. */
function mapaResolver_(d) {
  var url = String(d.url || '').trim().slice(0, 500);
  if (!hostMapasOk_(url)) return { ok: false, error: 'datos' };
  if (!limitar_('mapa_res', 40, 3600)) return { ok: false, error: 'limite' };
  for (var i = 0; i < 6; i++) {
    var c = coordsDeUrl_(url); if (c) return { ok: true, lat: c[0], lng: c[1] };
    var r; try { r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, headers: { 'Accept-Language': 'es', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } }); } catch (x) { return { ok: false, error: 'datos' }; }
    var code = r.getResponseCode(), h = r.getHeaders(), loc = h.Location || h.location;
    if (code >= 300 && code < 400 && loc) { url = String(loc); if (!hostMapasOk_(url)) { var c2 = coordsDeUrl_(url); return c2 ? { ok: true, lat: c2[0], lng: c2[1] } : { ok: false, error: 'datos' }; } continue; }
    var c3 = coordsDeUrl_(r.getContentText().slice(0, 60000)); return c3 ? { ok: true, lat: c3[0], lng: c3[1] } : { ok: false, error: 'datos' };
  }
  return { ok: false, error: 'datos' };
}

var ACCIONES_HUB_ADMIN = { foto_guardar: 1, lugar_guardar: 1, lugar_borrar: 1, categoria_agregar: 1, config_guardar: 1,
  fecha_guardar: 1, fecha_borrar: 1, correos_guardar: 1, correos_leer: 1, correo_prueba: 1, recordatorios_activar: 1,
  carta_guardar: 1, carta_leer: 1, cartas_importar: 1, pend_listar: 1, pend_aprobar: 1, pend_rechazar: 1, foto_drive_admin: 1, foto_subir: 1, foto_borrar: 1, ella_admin_leer: 1, ella_admin_set: 1, mapa_resolver: 1, sorpresa_set: 1,
  meta_guardar: 1, meta_borrar: 1, capsula_borrar: 1, cancion_guardar: 1, cancion_borrar: 1, aniv_guardar: 1, sistema_estado: 1, sistema_reparar: 1, carta_correo_prueba: 1 };
var ACCIONES_HUB_PUBLICAS = { fav: 1, correo_set: 1, pend_nota: 1, pend_foto: 1, meta_toggle: 1, capsula_crear: 1 };

/** Devuelve la respuesta si la acción es del hub; null si no lo es. */
function hubPost_(accion, d) {
  if (!ACCIONES_HUB_PUBLICAS[accion] && !ACCIONES_HUB_ADMIN[accion]) return null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: 'ocupado' };
  try {
    if (accion === 'fav') return favorito_(d);
    if (accion === 'correo_set') return correoSet_(d);
    if (accion === 'pend_nota' || accion === 'pend_foto') return pendienteNuevo_(accion, d);
    if (accion === 'meta_toggle') { var rm = metaToggle_(d); if (rm && rm.ok) CacheService.getScriptCache().remove('hub_v1'); return rm; }
    if (accion === 'capsula_crear') { var rc = capsulaCrear_(d); if (rc && rc.ok) { CacheService.getScriptCache().remove('hub_v1'); registrar_(accion, 'OK'); } return rc; }
    var no = autorizarAdmin_(accion, String(d.clave || ''));
    if (no) return no;
    var r;
    if (accion === 'foto_guardar') r = fotoGuardar_(d);
    else if (accion === 'lugar_guardar') r = lugarGuardar_(d);
    else if (accion === 'lugar_borrar') r = lugarBorrar_(d);
    else if (accion === 'categoria_agregar') r = categoriaAgregar_(d);
    else if (accion === 'fecha_guardar') r = fechaGuardar_(d);
    else if (accion === 'fecha_borrar') r = borrarFila_(HOJA_FECHAS, d.id);
    else if (accion === 'correos_guardar') r = correosGuardar_(d);
    else if (accion === 'correos_leer') r = { ok: true, correos: correos_(), estado: estadoCorreos_() };
    else if (accion === 'correo_prueba') r = correoPrueba_(d);
    else if (accion === 'recordatorios_activar') r = instalarTrigger_();
    else if (accion === 'carta_guardar') r = cartaGuardar_(d);
    else if (accion === 'carta_leer') r = cartaLeer_(d);
    else if (accion === 'cartas_importar') r = cartasImportar_(d);
    else if (accion === 'pend_listar') r = pendListar_();
    else if (accion === 'pend_aprobar') r = pendAprobar_(d);
    else if (accion === 'pend_rechazar') r = pendRechazar_(d);
    else if (accion === 'foto_drive_admin') r = fotoDrive_(String(d.id || ''), true);
    else if (accion === 'foto_subir') r = fotoSubir_(d);
    else if (accion === 'foto_borrar') r = fotoBorrar_(d);
    else if (accion === 'mapa_resolver') r = mapaResolver_(d);
    else if (accion === 'sorpresa_set') r = aplicarSorpresa_(d.habilitada === true);
    else if (accion === 'meta_guardar') r = metaGuardar_(d);
    else if (accion === 'meta_borrar') r = (hojaAuto_(HOJA_METAS, CAB_METAS), borrarFila_(HOJA_METAS, d.id));
    else if (accion === 'capsula_borrar') r = (hojaAuto_(HOJA_CAPSULAS, CAB_CAPS), borrarFila_(HOJA_CAPSULAS, d.id));
    else if (accion === 'cancion_guardar') r = cancionGuardar_(d);
    else if (accion === 'cancion_borrar') r = (hojaAuto_(HOJA_CANCIONES, CAB_CAN), borrarFila_(HOJA_CANCIONES, d.id));
    else if (accion === 'aniv_guardar') r = anivGuardar_(d);
    else if (accion === 'sistema_estado') r = sistemaEstado_();
    else if (accion === 'sistema_reparar') r = sistemaReparar_();
    else if (accion === 'carta_correo_prueba') r = cartaCorreoPrueba_(d);
    else if (accion === 'ella_admin_leer') r = ellaAdminLeer_();
    else if (accion === 'ella_admin_set') r = ellaAdminSet_(d);
    else r = configGuardar_(d);
    if (r && r.ok) { CacheService.getScriptCache().remove('hub_v1'); registrar_(accion, 'OK'); }
    return r;
  } finally { lock.releaseLock(); }
}

/** Favoritos: los puede marcar ella sin clave (solo sobre fotos que existan). */
function favorito_(d) {
  var tipo = d.tipo === 'carta' ? 'carta' : 'foto';
  var archivo = texto_(tipo === 'carta' ? d.fecha : d.archivo, 80);
  if (tipo === 'carta' ? !fechaOk_(archivo) : !archivoOk_(archivo)) return { ok: false, error: 'datos' };
  var sh = hoja_(HOJA_FAVORITOS), v = sh.getDataRange().getValues(), fila = -1;
  for (var i = 1; i < v.length; i++) if (v[i][0] === tipo && String(v[i][1]) === archivo) { fila = i + 1; break; }
  if (d.on === false) { if (fila > 0) sh.deleteRow(fila); }
  else if (fila < 0) {
    if (v.length > MAX_FAVORITOS) return { ok: false, error: 'limite' };
    sh.appendRow([tipo, archivo, marca_()]);
  }
  CacheService.getScriptCache().remove('hub_v1');
  return { ok: true };
}

function fotoGuardar_(d) {
  var archivo = texto_(d.archivo, 80);
  if (!archivoOk_(archivo)) return { ok: false, error: 'datos' };
  var fecha = texto_(d.fecha, 10);
  if (fecha && !fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var cats = (Array.isArray(d.categorias) ? d.categorias : []).map(function (c) { return texto_(c, 30).replace(/,/g, ''); }).filter(String).slice(0, 8).join(', ');
  var fila = [archivo, texto_(d.lugar_id, 40), fecha, cats, texto_(d.nota, 300)];
  var sh = hoja_(HOJA_FOTOS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === archivo) { sh.getRange(i + 1, 1, 1, 5).setValues([fila]); return { ok: true }; }
  sh.appendRow(fila);
  return { ok: true };
}

function lugarGuardar_(d) {
  var nombre = texto_(d.nombre, 80);
  var lat = Number(d.lat), lng = Number(d.lng);
  if (!nombre || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: 'datos' };
  var fechas = (Array.isArray(d.fechas) ? d.fechas : []).map(function (f) { return texto_(f, 10); });
  for (var k = 0; k < fechas.length; k++) if (!fechaOk_(fechas[k])) return { ok: false, error: 'fecha' };
  var sh = hoja_(HOJA_LUGARES), v = sh.getDataRange().getValues();
  var id = texto_(d.id, 40);
  if (id && !/^[\w\-]+$/.test(id)) return { ok: false, error: 'datos' };
  if (!id) id = 'l' + new Date().getTime().toString(36);
  var estado = d.estado === 'por_visitar' ? 'por_visitar' : 'visitado';
  var fila = [id, nombre, String(lat), String(lng), fechas.slice(0, 60).join(', '), texto_(d.nota, 300), estado];
  if (!String(sh.getRange(1, 7).getValue())) sh.getRange(1, 7).setValue('estado');
  sh.getRange(1, 7, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
  sh.getRange(1, 3, Math.max(sh.getMaxRows(), 2), 2).setNumberFormat('@');   // lat/lng como texto: no se mezclan con el idioma de la hoja
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { sh.getRange(i + 1, 1, 1, 7).setValues([fila]); return { ok: true, id: id }; }
  sh.getRange(sh.getLastRow() + 1, 1, 1, 7).setValues([fila]);
  return { ok: true, id: id };
}

function lugarBorrar_(d) {
  var id = texto_(d.id, 40);
  var sh = hoja_(HOJA_LUGARES), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) {
    sh.deleteRow(i + 1);
    // las fotos de ese lugar quedan sin lugar (pasan a "sin clasificar")
    var f = hoja_(HOJA_FOTOS), fv = f.getDataRange().getValues();
    for (var j = 1; j < fv.length; j++) if (String(fv[j][1]) === id) f.getRange(j + 1, 2).setValue('');
    return { ok: true };
  }
  return { ok: false, error: 'datos' };
}

function categoriaAgregar_(d) {
  var n = texto_(d.nombre, 30).replace(/,/g, '').toLowerCase();
  if (!n) return { ok: false, error: 'datos' };
  var sh = hoja_(HOJA_CATEGORIAS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === n) return { ok: true };
  sh.appendRow([n]);
  return { ok: true };
}

function configGuardar_(d) {
  if ('fecha_inicio' in d) {
    var f = texto_(d.fecha_inicio, 10);
    if (f && !fechaOk_(f)) return { ok: false, error: 'fecha' };
    escribirConfig_('fecha_inicio', f);
  }
  if ('aniversarios_correo' in d) escribirConfig_('aniversarios_correo', d.aniversarios_correo ? 'TRUE' : 'FALSE');
  if ('correo_ella_edita' in d) escribirConfig_('correo_ella_edita', d.correo_ella_edita ? 'TRUE' : 'FALSE');
  if (d.fn && typeof d.fn === 'object') Object.keys(d.fn).forEach(function (k) { if (k in FN_DEFECTO) escribirConfig_('fn_' + k, d.fn[k] ? 'TRUE' : 'FALSE'); });
  if ('tema' in d && ['auto', 'clasico', 'navidad', 'sanvalentin', 'doce'].indexOf(d.tema) >= 0) escribirConfig_('tema', d.tema);
  if ('correo_tema' in d && ['oscuro', 'claro', 'auto'].indexOf(d.correo_tema) >= 0) escribirConfig_('correo_tema', d.correo_tema);
  if ('carta_correo_a' in d && ['ella', 'yo', 'ambos'].indexOf(d.carta_correo_a) >= 0) escribirConfig_('carta_correo_a', d.carta_correo_a);
  if ('correo_enlace' in d) escribirConfig_('correo_enlace', d.correo_enlace ? 'TRUE' : 'FALSE');
  if ('dias_antes' in d) { var n = Math.round(Number(d.dias_antes)); if (!(n >= 0 && n <= 30)) return { ok: false, error: 'datos' }; escribirConfig_('dias_antes', String(n)); }
  return { ok: true };
}


// ============================ FASE 2 ============================

function hoy_() { return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'); }
function emailOk_(m) { return /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/.test(m) && m.length <= 120; }
function limitar_(clave, max, seg) {
  var c = CacheService.getScriptCache(), n = Number(c.get(clave) || 0);
  if (n >= max) return false;
  c.put(clave, String(n + 1), seg); return true;
}
function borrarFila_(hoja, id) {
  id = texto_(id, 60);
  var sh = hoja_(hoja), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { sh.deleteRow(i + 1); return { ok: true }; }
  return { ok: false, error: 'datos' };
}

// ---------------- CARTAS DIARIAS (2027): el texto de un día futuro NUNCA sale del servidor ----------------
/** Lista (solo fecha y título) de las cartas ya disponibles: hoy y días anteriores. */
/** Rango de cartas = primera y última fecha que existen en la hoja CARTAS (así, al importar cartas nuevas el calendario se ajusta solo). */
function rangoCartas_() {
  var a = '', b = '';
  filas_(HOJA_CARTAS).forEach(function (r) { var f = String(r[0]).trim(); if (fechaOk_(f)) { if (!a || f < a) a = f; if (!b || f > b) b = f; } });
  return { inicio: a || CARTAS_INICIO, fin: b || CARTAS_FIN };
}
function cartasDias_() {
  var hoy = hoy_(), out = [], rg = rangoCartas_();
  filas_(HOJA_CARTAS).forEach(function (r) {
    if (r[0] && r[0] <= hoy && fechaOk_(r[0]) && String(r[2]).trim()) out.push({ fecha: r[0], titulo: r[1] });
  });
  return { ok: true, hoy: hoy, inicio: rg.inicio, fin: rg.fin, disponibles: out };
}
function cartaDia_(fecha) {
  if (!fechaOk_(fecha) || fecha < CARTAS_MIN || fecha > CARTAS_MAX) return { ok: false, error: 'fecha' };
  var hoy = hoy_();
  if (fecha > hoy) return { ok: true, bloqueada: true, fecha: fecha, hoy: hoy };
  var f = filas_(HOJA_CARTAS);
  for (var i = 0; i < f.length; i++) if (f[i][0] === fecha) {
    if (!String(f[i][2]).trim()) return { ok: true, vacia: true, fecha: fecha, hoy: hoy };
    return { ok: true, fecha: fecha, hoy: hoy, titulo: f[i][1], texto: f[i][2] };
  }
  return { ok: true, vacia: true, fecha: fecha, hoy: hoy };
}
function cartaGuardar_(d) {
  var fecha = texto_(d.fecha, 10);
  if (!fechaOk_(fecha) || fecha < CARTAS_MIN || fecha > CARTAS_MAX) return { ok: false, error: 'fecha' };
  var titulo = texto_(d.titulo, 120), texto = String(d.texto == null ? '' : d.texto).replace(/\r/g, '').slice(0, 4000);
  var sh = hoja_(HOJA_CARTAS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === fecha) { sh.getRange(i + 1, 1, 1, 3).setValues([[fecha, titulo, texto]]); return { ok: true }; }
  sh.appendRow([fecha, titulo, texto]);
  return { ok: true };
}
/** Importa varias cartas a la vez: d.cartas = [{fecha, titulo, texto}, ...] */
function cartasImportar_(d) {
  var lista = Array.isArray(d.cartas) ? d.cartas.slice(0, 40) : [];
  var sh = hoja_(HOJA_CARTAS), v = sh.getDataRange().getValues(), idx = {}, n = 0;
  for (var i = 1; i < v.length; i++) idx[String(v[i][0])] = i + 1;
  for (var k = 0; k < lista.length; k++) {
    var c = lista[k], fecha = texto_(c.fecha, 10);
    if (!fechaOk_(fecha) || fecha < CARTAS_MIN || fecha > CARTAS_MAX) continue;
    var fila = [fecha, texto_(c.titulo, 120), String(c.texto == null ? '' : c.texto).replace(/\r/g, '').slice(0, 4000)];
    if (idx[fecha]) sh.getRange(idx[fecha], 1, 1, 3).setValues([fila]); else { sh.appendRow(fila); idx[fecha] = sh.getLastRow(); }
    n++;
  }
  return { ok: true, importadas: n };
}

// ---------------- FECHAS IMPORTANTES y CORREOS ----------------
function fechaGuardar_(d) {
  var titulo = texto_(d.titulo, 100), fecha = texto_(d.fecha, 10);
  if (!titulo) return { ok: false, error: 'datos' };
  if (!fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var avisar = ['ambos', 'ella', 'yo', 'nadie'].indexOf(d.avisar) >= 0 ? d.avisar : 'ambos';
  var dias = Math.round(Number(d.dias_antes)); if (!(dias >= 0 && dias <= 30)) dias = 1;
  var id = texto_(d.id, 40); if (id && !/^[\w\-]+$/.test(id)) return { ok: false, error: 'datos' };
  if (!id) id = 'f' + new Date().getTime().toString(36);
  var fila = [id, titulo, fecha, texto_(d.nota, 300), d.repite ? 'TRUE' : 'FALSE', avisar, String(dias)];
  var sh = hoja_(HOJA_FECHAS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { sh.getRange(i + 1, 1, 1, 7).setValues([fila]); return { ok: true, id: id }; }
  sh.appendRow(fila);
  return { ok: true, id: id };
}
function correos_() {
  var o = { yo: '', ella: '' };
  filas_(HOJA_CORREOS).forEach(function (r) { if (r[0] === 'yo' || r[0] === 'ella') o[r[0]] = String(r[1]).trim(); });
  return o;
}
function guardarCorreo_(rol, correo) {
  var sh = hoja_(HOJA_CORREOS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === rol) { sh.getRange(i + 1, 2).setValue(correo); return; }
  sh.appendRow([rol, correo]);
}
function correosGuardar_(d) {
  var tieneYo = ('yo' in d), tieneElla = ('ella' in d);
  var yo = tieneYo ? texto_(d.yo, 120) : '', ella = tieneElla ? texto_(d.ella, 120) : '';
  if ((yo && !emailOk_(yo)) || (ella && !emailOk_(ella))) return { ok: false, error: 'correo' };
  if (tieneYo) guardarCorreo_('yo', yo);
  if (tieneElla) guardarCorreo_('ella', ella);
  return { ok: true };
}
/** Ella puede poner SU correo sin clave (solo el suyo); recibe un aviso de confirmación. */
function correoSet_(d) {
  var m = texto_(d.correo, 120);
  if (!emailOk_(m)) return { ok: false, error: 'correo' };
  if (!esVerdadero_(leerConfig_().correo_ella_edita !== undefined ? leerConfig_().correo_ella_edita : 'TRUE') && correos_().ella) return { ok: false, error: 'no' };
  if (!limitar_('correo_set', 5, 3600)) return { ok: false, error: 'limite' };
  guardarCorreo_('ella', m);
  try { mandar_(m, 'Listo, mi amor 💌', 'Este correo quedó guardado para recibir los recordatorios de nuestras fechas importantes. Te amo.', { icono: '&#128140;', titulo: '¡Listo, mi amor!', texto: 'Este correo quedó guardado para recibir los recordatorios de nuestras fechas importantes.', boton: 'Ir a nuestro rincón' }); } catch (x) { console.error('correo_set: ' + x); }
  return { ok: true };
}
var SITIO_URL = 'https://sitiosv.github.io/NUESTRO-RINCON-/';
// Enlace de los correos: apunta a Google (script.google.com), que Gmail no bloquea; esa página abre el sitio.
var ENLACE_CORREO = 'https://script.google.com/macros/s/AKfycbzim9NIUvePX36k1ejl9iBMWE8pl_A9PJi4XyF6OlsGNWv8XNpnMDrqFRkb0utQ9dxhPg/exec?action=ir';
function enlaceCorreo_() {
  try { return esVerdadero_(leerConfig_().correo_enlace) ? ENLACE_CORREO : ''; } catch (e) { return ''; }
}
function sitioUrl_() {
  var u = SITIO_URL; try { var cu = leerConfig_().sitio_url; if (cu && /^https:\/\//.test(String(cu))) u = String(cu); } catch (e) {}
  return u;
}
/** Página puente: muestra un botón que abre el sitio real. */
function irAlSitio_() {
  var u = sitioUrl_();
  var h = '<!doctype html><html lang="es"><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nuestro Rincón</title></head>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#3a0f24;font-family:Georgia,serif;text-align:center;color:#fff5e9">' +
    '<div style="padding:24px"><div style="font-size:44px;color:#e8607f">&hearts;</div><h2 style="margin:.4em 0">Nuestro Rincón</h2>' +
    '<a href="' + htmlEsc_(u) + '" target="_top" style="display:inline-block;margin-top:14px;padding:14px 30px;border-radius:999px;background:#d4af37;color:#3a0f24;font-weight:700;text-decoration:none;font-size:17px">Abrir nuestro rincón &#128140;</a></div>' +
    '<script>try{window.top.location.href=' + JSON.stringify(u) + ';}catch(e){}</script></body></html>';
  return HtmlService.createHtmlOutput(h).setTitle('Nuestro Rincón').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function fechaLarga_(k) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || '')); if (!m) return String(k || '');
  var M = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return Number(m[3]) + ' de ' + M[Number(m[2]) - 1] + ' de ' + m[1];
}
function htmlEsc_(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/**
 * Correo con diseño: tarjeta crema sobre fondo vino, corazones, caja con la fecha y botón al sitio.
 * o = { icono, titulo, cuando, fecha, texto, boton }
 */
function correoHtml_(o) {
  var cfgc = {}; try { cfgc = leerConfig_(); } catch (e) {}
  var tema = ['claro', 'oscuro', 'auto'].indexOf(String(cfgc.correo_tema)) >= 0 ? String(cfgc.correo_tema) : 'oscuro';
  var url = enlaceCorreo_(), conEnlace = !!url;
  var VINO = '#3a0f24', CREMA = '#fff5e9', ORO = '#d4af37', ROSA = '#e8607f', TEXTO = '#4a2a38';
  var f = "Georgia,'Times New Roman',serif";
  // oscuro: fondo vino y tarjeta crema · claro/auto: fondo crema suave y tarjeta blanca (auto añade modo oscuro donde el programa de correo lo permite)
  var FONDO = tema === 'oscuro' ? VINO : '#fbeee3', TARJETA = tema === 'oscuro' ? CREMA : '#ffffff', PIE = tema === 'oscuro' ? '#d9b8c4' : '#8a5a6c';
  var izq = o.alinear === 'left', al = izq ? 'left' : 'center';
  var cuadro = (o.cuando || o.fecha)
    ? '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:18px auto 6px"><tr><td class="o-box" style="border:2px dashed ' + ORO + ';border-radius:14px;padding:12px 26px;background:#fffaf2;text-align:center">' +
      (o.cuando ? '<div style="font:700 20px ' + f + ';color:' + ROSA + '">' + htmlEsc_(o.cuando) + '</div>' : '') +
      (o.fecha ? '<div class="o-text" style="font:14px ' + f + ';color:' + TEXTO + ';margin-top:3px">' + htmlEsc_(o.fecha) + '</div>' : '') + '</td></tr></table>'
    : '';
  var parrafos = o.texto ? String(o.texto).replace(/\r/g, '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(String) : [];
  var texto = parrafos.length
    ? '<div class="o-text" style="font:17px/1.7 ' + f + ';color:' + TEXTO + ';text-align:' + al + ';margin:16px 4px 0">' +
      parrafos.map(function (p, i) { return '<p style="margin:0 0 14px">' + (izq && i === 0 && p.length > 40 ? '<span style="font:700 34px/0.9 ' + f + ';color:' + ROSA + ';float:left;padding:4px 7px 0 0">' + htmlEsc_(p.charAt(0)) + '</span>' + htmlEsc_(p.slice(1)) : htmlEsc_(p)).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>'
    : '';
  var boton = !conEnlace ? '' : '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto 4px"><tr><td align="center" bgcolor="' + ORO + '" style="border-radius:999px"><a href="' + htmlEsc_(url) + '" target="_blank" style="display:inline-block;padding:14px 30px;font:700 16px ' + f + ';color:' + VINO + ';text-decoration:none;border-radius:999px">' + htmlEsc_(o.boton || 'Abrir nuestro rincón') + ' &#128140;</a></td></tr></table>';
  var estiloOscuro = tema === 'auto'
    ? '<style>@media (prefers-color-scheme: dark){.o-bg{background:#2a0b19 !important}.o-card{background:#3a1626 !important}.o-title{color:#f7e29c !important}.o-text{color:#f3dfe6 !important}.o-foot{color:#d9b8c4 !important}.o-box{background:#4a2033 !important}}</style>'
    : '';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">' + estiloOscuro + '</head><body class="o-bg" style="margin:0;padding:0;background:' + FONDO + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + FONDO + '" class="o-bg" style="background:' + FONDO + '"><tr><td align="center" style="padding:26px 12px">' +
    '<div style="font:22px ' + f + ';color:' + ROSA + ';letter-spacing:10px;margin-bottom:10px">&hearts; &hearts; &hearts;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="background:' + ORO + ';border-radius:22px;padding:3px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="o-card" bgcolor="' + TARJETA + '" style="background:' + TARJETA + ';border-radius:20px;padding:30px 24px">' +
    '<div style="text-align:center;font:46px/1 ' + f + ';color:' + ROSA + '">' + (o.icono || '&hearts;') + '</div>' +
    '<div class="o-title" style="text-align:center;font:italic 700 26px/1.25 ' + f + ';color:' + VINO + ';margin-top:12px">' + htmlEsc_(o.titulo || 'Nuestro Rincón') + '</div>' +
    '<div style="text-align:center;color:' + ORO + ';font:18px ' + f + ';letter-spacing:6px;margin-top:8px">&mdash; &hearts; &mdash;</div>' +
    cuadro + texto + boton +
    '<div style="text-align:center;font:italic 15px ' + f + ';color:' + ROSA + ';margin-top:18px">Te amo, mi reina &hearts;</div>' +
    '</td></tr></table></td></tr></table>' +
    '<div class="o-foot" style="font:12px ' + f + ';color:' + PIE + ';margin-top:18px;line-height:1.6">Un aviso hecho con mucho cariño desde <b style="color:' + ORO + '">Nuestro Rincón</b></div>' +
    '<div style="font:16px ' + f + ';color:' + ROSA + ';letter-spacing:8px;margin-top:10px">&hearts; &hearts; &hearts;</div>' +
    '</td></tr></table></body></html>';
}

function mandar_(a, asunto, cuerpo, ext) {
  var lk = enlaceCorreo_(), plano = cuerpo + '\n\n' + (lk ? 'Abre nuestro rincón: ' + lk : 'Con amor, Nuestro Rincón');
  var html = ''; try { html = correoHtml_(ext || { titulo: asunto, texto: cuerpo }); } catch (e) { console.error('html correo: ' + e); }
  var errores = [];
  // 1) MailApp con diseño   2) MailApp solo texto (sin nombre ni HTML)   3) GmailApp (respaldo)
  try { var o = { to: a, subject: asunto, body: plano, name: 'Nuestro Rincon' }; if (html) o.htmlBody = html; MailApp.sendEmail(o); return; } catch (e1) { errores.push('MailApp: ' + e1); console.error(errores[errores.length - 1]); }
  try { MailApp.sendEmail(a, asunto, plano); return; } catch (e2) { errores.push('MailApp simple: ' + e2); console.error(errores[errores.length - 1]); }
  try { var g = { name: 'Nuestro Rincon' }; if (html) g.htmlBody = html; GmailApp.sendEmail(a, asunto, plano, g); return; } catch (e3) { errores.push('GmailApp: ' + e3); console.error(errores[errores.length - 1]); }
  throw new Error(errores.join(' | '));
}

/** ext (opcional) = { icono, titulo, cuando, fecha, texto, boton } para el diseño del correo. */
function enviar_(rol, asunto, cuerpo, ext) {
  var c = correos_();
  if (rol === 'ambos') { var n = 0; if (c.yo) { mandar_(c.yo, asunto, cuerpo, ext); n++; } if (c.ella) { mandar_(c.ella, asunto, cuerpo, ext); n++; } return n; }
  if (c[rol]) { mandar_(c[rol], asunto, cuerpo, ext); return 1; }
  return 0;
}
function correoPrueba_(d) {
  var c = correos_(), rol = (d && (d.rol === 'yo' || d.rol === 'ella')) ? d.rol : 'ambos';
  if (rol === 'ambos' ? (!c.yo && !c.ella) : !c[rol]) return { ok: false, error: 'sin-correos' };
  var n = 0;
  try { n = enviar_(rol, '💌 Prueba de recordatorio', 'Si lees esto, los recordatorios por correo funcionan. Te amo ❤️', { icono: '&#9993;', titulo: 'Prueba de recordatorio', texto: 'Si lees esto, los recordatorios por correo funcionan. Así se verán los avisos de nuestras fechas importantes.' }); }
  catch (x) { registrar_('correo_prueba', 'ERROR: ' + x); return { ok: false, error: 'envio', detalle: String(x).slice(0, 300) }; }
  var cuota = null; try { cuota = MailApp.getRemainingDailyQuota(); } catch (q) {}
  return { ok: true, enviados: n, cuota: cuota };
}
function diasEntre_(a, b) { // a, b = 'yyyy-mm-dd'
  var p = a.split('-').map(Number), q = b.split('-').map(Number);
  return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
}
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function diasMes_(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
/** Próxima ocurrencia (>= hoy) de una fecha que se repite cada año. */
function proximaAnual_(fecha, hoy) {
  var p = fecha.split('-').map(Number), y = Number(hoy.slice(0, 4));
  for (var k = 0; k < 2; k++) {
    var yy = y + k, dd = Math.min(p[2], diasMes_(yy, p[1] - 1)), f = yy + '-' + pad2_(p[1]) + '-' + pad2_(dd);
    if (f >= hoy) return f;
  }
  return fecha;
}
function proximoAnivMensual_(inicio, hoy) {
  var p = inicio.split('-').map(Number);
  for (var n = 1; n < 2400; n++) {
    var tm = p[1] - 1 + n, y = p[0] + Math.floor(tm / 12), m = tm % 12;
    var f = y + '-' + pad2_(m + 1) + '-' + pad2_(Math.min(p[2], diasMes_(y, m)));
    if (f >= hoy) return { n: n, fecha: f };
  }
  return null;
}
/** Se ejecuta sola cada día (trigger). Envía el aviso "N días antes" y el del propio día, una sola vez. */
function enviarRecordatorios() {
  var cfg = leerConfig_(), hoy = hoy_(), props = PropertiesService.getScriptProperties();
  var enviados = []; try { enviados = JSON.parse(props.getProperty('ENVIADOS') || '[]'); } catch (x) { enviados = []; }
  var items = itemsRecordatorio_(cfg, hoy);
  var cuenta = 0;
  items.forEach(function (it) {
    var dias = diasEntre_(hoy, it.fecha);
    if (dias < 0 || (dias !== 0 && dias !== it.antes)) return;
    var clave = it.id + '|' + it.fecha + '|' + dias;
    if (enviados.indexOf(clave) >= 0) return;
    var cuando = dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : 'en ' + dias + ' días';
    var cuerpo = '💌 ' + it.titulo + ' — ' + cuando + ' (' + it.fecha + ')' + (it.nota ? '\n\n' + it.nota : '') + '\n\nCon amor ❤️';
    try { cuenta += enviar_(it.avisar, '💌 Recordatorio: ' + it.titulo + ' (' + cuando + ')', cuerpo, { icono: /juntos/.test(it.titulo) ? '&#127874;' : '&#128140;', titulo: it.titulo, cuando: cuando === 'HOY' ? 'Es HOY' : cuando.charAt(0).toUpperCase() + cuando.slice(1), fecha: fechaLarga_(it.fecha), texto: it.nota || 'No lo olvides, mi amor. Te lo recuerdo con todo mi cariño.', boton: 'Abrir nuestro rincón' }); enviados.push(clave); }
    catch (x) { console.error('recordatorio: ' + x); registrar_('recordatorio', 'ERROR: ' + x); }
  });
  props.setProperty('ENVIADOS', JSON.stringify(enviados.slice(-300)));
  if (cuenta) registrar_('recordatorios', 'enviados: ' + cuenta);
  try { enviarCartaDelDia_(); } catch (x) { console.error('carta del día: ' + x); registrar_('carta_correo', 'ERROR: ' + x); }
}
/** Lista de avisos (fechas + aniversario mensual) con su próxima fecha. */
function itemsRecordatorio_(cfg, hoy) {
  var items = [], defecto = Number(cfg.dias_antes);
  if (!(defecto >= 0)) defecto = 1;
  filas_(HOJA_FECHAS).forEach(function (r) {
    if (!r[0] || !fechaOk_(r[2]) || r[5] === 'nadie') return;
    var f = esVerdadero_(r[4]) ? proximaAnual_(r[2], hoy) : r[2];
    items.push({ id: r[0], titulo: r[1], fecha: f, nota: r[3], avisar: r[5] || 'ambos', antes: r[6] === '' ? defecto : Number(r[6]) });
  });
  if (esVerdadero_(cfg.aniversarios_correo) && fechaOk_(String(cfg.fecha_inicio))) {
    var a = proximoAnivMensual_(String(cfg.fecha_inicio), hoy);
    if (a) items.push({ id: 'aniv' + a.n, titulo: a.n % 12 === 0 ? (a.n / 12) + (a.n === 12 ? ' año' : ' años') + ' juntos' : a.n + (a.n === 1 ? ' mes' : ' meses') + ' juntos', fecha: a.fecha, nota: '', avisar: 'ambos', antes: defecto });
  }
  return items;
}
/** Estado para el administrador de correos. */
function estadoCorreos_() {
  var hoy = hoy_(), cfg = leerConfig_(), trig = false;
  try { trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviarRecordatorios'; }); } catch (x) {}
  var prox = itemsRecordatorio_(cfg, hoy).map(function (it) {
    var dias = diasEntre_(hoy, it.fecha);
    return { titulo: it.titulo, fecha: it.fecha, dias: dias, avisar: it.avisar, antes: it.antes, aviso_en: dias - it.antes };
  }).filter(function (it) { return it.dias >= 0; }).sort(function (a, b) { return a.dias - b.dias; }).slice(0, 6);
  var cuota = null; try { cuota = MailApp.getRemainingDailyQuota(); } catch (x) {}
  return { trigger: trig, cuota: cuota, hoy: hoy, proximos: prox };
}

/** Crea (una sola vez) el disparador diario de las 8:00 a. m. */
function instalarTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'enviarRecordatorios') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().atHour(8).nearMinute(0).everyDays(1).inTimezone(ZONA).create();
  return { ok: true };
}
/** Ejecútala UNA vez desde el editor para conceder los permisos (correo, Drive y disparadores). */
function autorizar() {
  console.log('Cuota de correos hoy: ' + MailApp.getRemainingDailyQuota());
  console.log('Carpeta de fotos: ' + carpetaFotos_().getName());
  console.log('Disparadores: ' + ScriptApp.getProjectTriggers().length);
  instalarTrigger_();
  console.log('Recordatorio diario (8:00 a. m.) activado.');
}

// ---------------- LO QUE ELLA PUEDE AGREGAR (pendiente hasta que yo apruebe) ----------------
function carpetaFotos_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('CARPETA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) { /* se crea otra */ } }
  var f = DriveApp.createFolder('Rincon_fotos_privadas');
  props.setProperty('CARPETA_ID', f.getId());
  return f;
}
function pendientesActivos_() {
  return filas_(HOJA_PEND).filter(function (r) { return r[8] === 'pendiente'; }).length;
}
function pendienteNuevo_(accion, d) {
  if (!limitar_('pend', 20, 3600)) return { ok: false, error: 'limite' };
  if (pendientesActivos_() >= MAX_PENDIENTES) return { ok: false, error: 'lleno' };
  var fecha = texto_(d.fecha, 10);
  if (fecha && !fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var lugar = texto_(d.lugar_id, 40), cat = texto_(d.categoria, 30).replace(/,/g, '');
  var id = 'p' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  var texto = texto_(d.texto, 600), driveId = '';
  if (accion === 'pend_nota') {
    if (!texto) return { ok: false, error: 'datos' };
  } else {
    var b64 = String(d.imagen || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!b64 || b64.length > MAX_UPLOAD) return { ok: false, error: 'tamano' };
    var bytes;
    try { bytes = Utilities.base64Decode(b64); } catch (x) { return { ok: false, error: 'datos' }; }
    if (bytes.length > MAX_FOTO_BYTES || bytes.length < 200) return { ok: false, error: 'tamano' };
    // solo JPEG (firma FF D8 FF)
    if ((bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216 || (bytes[2] & 255) !== 255) return { ok: false, error: 'tipo' };
    var file = carpetaFotos_().createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '.jpg'));
    driveId = file.getId();
  }
  hoja_(HOJA_PEND).appendRow([id, accion === 'pend_nota' ? 'nota' : 'foto', texto, driveId, lugar, fecha, cat, marca_(), 'pendiente']);
  registrar_(accion, 'pendiente ' + id);
  return { ok: true };
}
function pendListar_() {
  var out = filas_(HOJA_PEND).filter(function (r) { return r[8] === 'pendiente'; }).map(function (r) {
    return { id: r[0], tipo: r[1], texto: r[2], drive_id: r[3], lugar_id: r[4], fecha: r[5], categoria: r[6], creado: r[7] };
  });
  return { ok: true, pendientes: out };
}
function pendFila_(id) {
  var sh = hoja_(HOJA_PEND), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) return { sh: sh, fila: i + 1, r: v[i] };
  return null;
}
function pendAprobar_(d) {
  var p = pendFila_(texto_(d.id, 60));
  if (!p || p.r[8] !== 'pendiente') return { ok: false, error: 'datos' };
  var fecha = texto_(d.fecha, 10); if (fecha && !fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var lugar = texto_(d.lugar_id, 40);
  p.sh.getRange(p.fila, 5, 1, 2).setValues([[lugar, fecha]]);
  if (p.r[1] === 'foto') {
    var cats = (Array.isArray(d.categorias) ? d.categorias : []).map(function (c) { return texto_(c, 30).replace(/,/g, ''); }).filter(String).slice(0, 8);
    hoja_(HOJA_FOTOS).appendRow(['drive_' + p.r[3], lugar, fecha, cats.join(', '), texto_(d.nota != null ? d.nota : p.r[2], 300)]);
  }
  p.sh.getRange(p.fila, 9).setValue('aprobado');
  return { ok: true };
}
function pendRechazar_(d) {
  var p = pendFila_(texto_(d.id, 60));
  if (!p || p.r[8] !== 'pendiente') return { ok: false, error: 'datos' };
  if (p.r[1] === 'foto' && p.r[3]) { try { DriveApp.getFileById(String(p.r[3])).setTrashed(true); } catch (x) { console.error('papelera: ' + x); } }
  p.sh.getRange(p.fila, 9).setValue('rechazado');
  return { ok: true };
}
/** Entrega una foto de Drive como data-URI. Público: solo fotos ya aprobadas. Admin: también las pendientes. */
function fotoDrive_(id, esAdmin) {
  if (!/^[\w\-]{10,80}$/.test(id)) return { ok: false, error: 'datos' };
  var permitido = esAdmin;
  if (!permitido) permitido = filas_(HOJA_FOTOS).some(function (r) { return r[0] === 'drive_' + id || r[5] === id; });
  if (!permitido) return { ok: false, error: 'no' };
  try {
    var blob = DriveApp.getFileById(id).getBlob();
    return { ok: true, data: 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes()) };
  } catch (x) { return { ok: false, error: 'no' }; }
}

/** Lectura de una carta (cualquier día) para el editor del administrador. */
function cartaLeer_(d) {
  var fecha = texto_(d.fecha, 10);
  if (!fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var f = filas_(HOJA_CARTAS);
  for (var i = 0; i < f.length; i++) if (f[i][0] === fecha) return { ok: true, fecha: fecha, titulo: f[i][1], texto: f[i][2] };
  return { ok: true, fecha: fecha, titulo: '', texto: '' };
}


// ============================ SOPORTE: bloqueo por página o de todo el sitio ============================
var PAGINAS_BLOQUEABLES = ['home', 'regalo', 'lugares', 'fotos', 'fechas', 'cartas', 'linea', 'favoritos', 'metas', 'capsulas', 'musica', 'retro'];
function listaPaginas_(v) {
  return String(v == null ? '' : v).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return PAGINAS_BLOQUEABLES.indexOf(x) >= 0; });
}
/** admin_entrar: valida la clave para entrar al modo administrador. bloqueo_set: bloquea o activa una página o todo el sitio. */
function soporte_(accion, d) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: 'ocupado' };
  try {
    var no = autorizarAdmin_(accion, String(d.clave || ''));
    if (no) return no;
    if (accion === 'admin_entrar') { registrar_(accion, 'OK (' + ROL_ + ')'); return { ok: true, rol: ROL_ }; }
    var bloquear = d.bloquear === true, ahora = marca_(), cache = CacheService.getScriptCache();
    if (d.alcance === 'sitio') {
      escribirConfig_('sitio_bloqueado', bloquear ? 'TRUE' : 'FALSE');
    } else if (d.alcance === 'pagina') {
      var pg = String(d.pagina || '');
      if (PAGINAS_BLOQUEABLES.indexOf(pg) < 0) return { ok: false, error: 'datos' };
      var lista = listaPaginas_(leerConfig_().paginas_bloqueadas).filter(function (x) { return x !== pg; });
      if (bloquear) lista.push(pg);
      escribirConfig_('paginas_bloqueadas', lista.join(','));
    } else return { ok: false, error: 'datos' };
    escribirConfig_('ultima_actualizacion', ahora);
    cache.remove('estado_v1');
    registrar_('bloqueo_' + d.alcance, (bloquear ? 'BLOQUEAR ' : 'ACTIVAR ') + (d.pagina || 'sitio'));
    var cfg = leerConfig_();
    return { ok: true, sitio_bloqueado: esVerdadero_(cfg.sitio_bloqueado), paginas_bloqueadas: listaPaginas_(cfg.paginas_bloqueadas), actualizado: ahora };
  } finally { lock.releaseLock(); }
}


// ============================ FASE 5: funciones con interruptor, estado del sistema, metas, cápsulas, música, aniversarios ============================
var VERSION_SITIO = 'v14';
var HOJA_METAS = 'METAS', HOJA_CAPSULAS = 'CAPSULAS', HOJA_CANCIONES = 'CANCIONES', HOJA_ANIV = 'ANIVERSARIOS';
var CAB_METAS = ['id', 'texto', 'hecha', 'fecha_hecha', 'nota', 'orden', 'creado'];
var CAB_CAPS = ['id', 'autor', 'titulo', 'texto', 'abre', 'creado'];
var CAB_CAN = ['id', 'titulo', 'artista', 'url', 'fecha', 'nota'];
var CAB_ANIV = ['n', 'titulo', 'texto'];

/** Interruptores (sí/no) de cada función. Se guardan en CONFIGURACION como fn_<nombre>. */
var FN_DEFECTO = { estado: true, validar: true, correo_carta: false, hace_anio: true, por_visitar: true, metas: true, capsulas: true, musica: true, retro: true, album: true, aniv_mes: true, temas: true, barra: true };
function funciones_(cfg) {
  var o = {};
  Object.keys(FN_DEFECTO).forEach(function (k) {
    var v = cfg['fn_' + k];
    o[k] = (v === undefined || v === '') ? FN_DEFECTO[k] : esVerdadero_(v);
  });
  return o;
}

/** Devuelve la hoja; si no existe la crea con su encabezado (así no hace falta volver a ejecutar inicializar()). */
function hojaAuto_(nombre, cab) {
  var ss = libro_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(cab);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), cab.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}
function filasAuto_(nombre, cab) { hojaAuto_(nombre, cab); return filas_(nombre); }
function upsertFila_(sh, id, fila) {
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) { sh.getRange(i + 1, 1, 1, fila.length).setValues([fila]); return false; }
  sh.getRange(sh.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
  return true;
}
function idNuevo_(pref) { return pref + new Date().getTime().toString(36) + Math.floor(Math.random() * 46656).toString(36); }

// ---------------- METAS / SUEÑOS ----------------
function metasPublicas_() {
  return filasAuto_(HOJA_METAS, CAB_METAS).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: r[0], texto: r[1], hecha: esVerdadero_(r[2]), fecha_hecha: r[3], nota: r[4], orden: Number(r[5]) || 0 };
  });
}
function metaGuardar_(d) {
  var texto = texto_(d.texto, 160); if (!texto) return { ok: false, error: 'datos' };
  var id = texto_(d.id, 40); if (id && !/^[\w\-]+$/.test(id)) return { ok: false, error: 'datos' };
  var sh = hojaAuto_(HOJA_METAS, CAB_METAS), v = sh.getDataRange().getValues(), ex = null;
  if (id) for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) ex = v[i];
  if (!id) { id = idNuevo_('m'); if (v.length > 400) return { ok: false, error: 'lleno' }; }
  var fila = [id, texto, ex ? ex[2] : 'FALSE', ex ? ex[3] : '', texto_(d.nota, 300), ex ? ex[5] : String(v.length), ex ? ex[6] : hoy_()];
  upsertFila_(sh, id, fila);
  return { ok: true, id: id };
}
function metaToggle_(d) {
  if (!limitar_('meta_t', 80, 3600)) return { ok: false, error: 'limite' };
  var id = texto_(d.id, 40), sh = hojaAuto_(HOJA_METAS, CAB_METAS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) {
    var hecha = d.hecha === true;
    sh.getRange(i + 1, 3, 1, 2).setValues([[hecha ? 'TRUE' : 'FALSE', hecha ? hoy_() : '']]);
    return { ok: true };
  }
  return { ok: false, error: 'datos' };
}

// ---------------- CÁPSULAS DEL TIEMPO (el texto nunca sale antes de su fecha) ----------------
function capsulasPublicas_() {
  var hoy = hoy_();
  return filasAuto_(HOJA_CAPSULAS, CAB_CAPS).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: r[0], autor: r[1], titulo: r[2], abre: r[4], creado: r[5], abierta: fechaOk_(r[4]) && r[4] <= hoy };
  });
}
function capsulaCrear_(d) {
  if (!limitar_('caps', 8, 3600)) return { ok: false, error: 'limite' };
  var autor = d.autor === 'ella' ? 'ella' : 'yo', hoy = hoy_();
  var titulo = texto_(d.titulo, 80), texto = String(d.texto == null ? '' : d.texto).replace(/\r/g, '').trim().slice(0, 3000), abre = texto_(d.abre, 10);
  if (!titulo || !texto || !fechaOk_(abre) || abre <= hoy || diasEntre_(hoy, abre) > 3650) return { ok: false, error: 'datos' };
  var sh = hojaAuto_(HOJA_CAPSULAS, CAB_CAPS);
  if (sh.getLastRow() > 300) return { ok: false, error: 'lleno' };
  var id = idNuevo_('c');
  upsertFila_(sh, id, [id, autor, titulo, texto, abre, hoy]);
  return { ok: true, id: id };
}
function capsulaAbrir_(id) {
  id = texto_(id, 40); var hoy = hoy_(), f = filasAuto_(HOJA_CAPSULAS, CAB_CAPS);
  for (var i = 0; i < f.length; i++) if (f[i][0] === id) {
    if (!fechaOk_(f[i][4]) || f[i][4] > hoy) return { ok: true, bloqueada: true, abre: f[i][4], hoy: hoy };
    return { ok: true, id: id, autor: f[i][1], titulo: f[i][2], texto: f[i][3], abre: f[i][4], creado: f[i][5] };
  }
  return { ok: false, error: 'datos' };
}

// ---------------- MÚSICA ----------------
function cancionesPublicas_() {
  return filasAuto_(HOJA_CANCIONES, CAB_CAN).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: r[0], titulo: r[1], artista: r[2], url: r[3], fecha: r[4], nota: r[5] };
  });
}
function cancionGuardar_(d) {
  var titulo = texto_(d.titulo, 100); if (!titulo) return { ok: false, error: 'datos' };
  var url = texto_(d.url, 300); if (url && !/^https:\/\/[^\s]{3,290}$/.test(url)) return { ok: false, error: 'datos' };
  var fecha = texto_(d.fecha, 10); if (fecha && !fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var id = texto_(d.id, 40); if (id && !/^[\w\-]+$/.test(id)) return { ok: false, error: 'datos' };
  var sh = hojaAuto_(HOJA_CANCIONES, CAB_CAN);
  if (!id) { if (sh.getLastRow() > 500) return { ok: false, error: 'lleno' }; id = idNuevo_('s'); }
  upsertFila_(sh, id, [id, titulo, texto_(d.artista, 100), url, fecha, texto_(d.nota, 200)]);
  return { ok: true, id: id };
}

// ---------------- ANIVERSARIOS MENSUALES: mini sorpresa del día (el texto sale solo el día que toca) ----------------
function anivFecha_(inicio, n) {
  var p = inicio.split('-').map(Number), tm = p[1] - 1 + n, y = p[0] + Math.floor(tm / 12), m = tm % 12;
  return y + '-' + pad2_(m + 1) + '-' + pad2_(Math.min(p[2], diasMes_(y, m)));
}
function anivTiempo_(n) {
  var a = Math.floor(n / 12), m = n % 12;
  if (!a) return n + (n === 1 ? ' mes' : ' meses');
  if (!m) return a + (a === 1 ? ' año' : ' años');
  return a + (a === 1 ? ' año' : ' años') + ' y ' + m + (m === 1 ? ' mes' : ' meses');
}
function anivDefecto_(n) {
  var t = anivTiempo_(n), anual = n % 12 === 0;
  var titulo = anual ? '¡' + t + ' juntos!' : 'Hoy cumplimos ' + t;
  var P = [
    'Hoy se cumplen ' + t + ' desde que decidimos caminar juntos, y quise detenerme un momento para decirte gracias.\n\nGracias por cada conversación, por cada risa y por cada vez que elegiste quedarte. Los días buenos se disfrutan más contigo, y los difíciles pesan menos.\n\nMini sorpresa: hoy, antes de dormir, cuéntame cuál fue tu momento favorito de nosotros. Yo ya tengo el mío.\n\nTe amo, mi reina.',
    ('Hace ' + t + ' empezó una historia que hoy me parece la mejor que he vivido.\n\nNo es la cantidad de tiempo lo que me emociona, sino cómo se siente cada día contigo: tranquilo, en casa, con ganas de más.\n\nMini sorpresa: elige una canción que nos represente y dedícamela hoy. Yo haré lo mismo.\n\nGracias por ser tú. Te quiero muchísimo.'),
    'Otro mes, otra razón para agradecer. Hoy cumplimos ' + t + ' y me quedo con lo pequeño: tus mensajes, tus bromas, tus abrazos.\n\nLo importante no es que todo sea perfecto, sino que seguimos eligiéndonos, y eso para mí vale más que cualquier celebración.\n\nMini sorpresa: planea con tiempo un detalle pequeño para el próximo mes, algo que nos haga reír.\n\nTe amo, mi amor.',
    'Hoy cumplimos ' + t + ' y siento que cada día contigo me enseña algo nuevo sobre el cariño.\n\nGracias por tu paciencia cuando me enredo, por tu manera de escucharme y por celebrar conmigo hasta lo más pequeño.\n\nMini sorpresa: manda una foto tuya de hoy, aunque sea sencilla. Quiero guardarla como recuerdo de este día.\n\nQue sigamos sumando meses y recuerdos. Te quiero.',
    'Si pudiera volver a elegir, te elegiría otra vez: hoy, hace ' + t + ' y siempre.\n\nQuiero que sepas que todo lo que construimos, aunque sea con pasos pequeños, lo cuido como se cuida lo valioso.\n\nMini sorpresa: escribe en una nota tres cosas que quieres que hagamos juntos este año y guárdala.\n\nFeliz aniversario, mi reina.',
    'Cuando pienso en estos ' + t + ' me da por sonreír sin motivo. Eso me pasa cuando recuerdo algo que me hizo bien, y tú me haces bien.\n\nGracias por la ternura, por la risa fácil y por hacer que lo cotidiano se sienta especial.\n\nMini sorpresa: hoy dime algo que te haya hecho feliz esta semana; quiero celebrarlo contigo.\n\nTe amo, mi amor.'
  ];
  var A = 'Hoy cumplimos ' + t + ' juntos y casi no me lo creo: cuánta vida cabe en este tiempo.\n\nHemos reído, nos hemos acompañado en lo bueno y en lo difícil, y hemos aprendido a querernos mejor. Si algo he entendido es que el amor no es un momento: es una decisión que se vuelve costumbre bonita.\n\nGracias por cada capítulo y por los que aún nos faltan. Quiero seguir construyendo contigo, con paciencia, con respeto y con muchas ganas.\n\nMini sorpresa: busca una foto de nosotros que te haga sonreír y póntela como fondo por una semana.\n\nTe amo, mi reina. Feliz aniversario.';
  return { titulo: titulo, texto: anual ? A : P[n % P.length] };
}
function anivCarta_(n) {
  n = Math.round(Number(n));
  var inicio = String(leerConfig_().fecha_inicio || '');
  if (!(n >= 1 && n <= 600) || !fechaOk_(inicio)) return { ok: false, error: 'datos' };
  var fecha = anivFecha_(inicio, n), hoy = hoy_();
  if (fecha > hoy) return { ok: true, bloqueada: true, fecha: fecha, hoy: hoy };
  var f = filasAuto_(HOJA_ANIV, CAB_ANIV), custom = null;
  for (var i = 0; i < f.length; i++) if (Number(f[i][0]) === n && String(f[i][2]).trim()) custom = f[i];
  var base = anivDefecto_(n);
  return { ok: true, n: n, fecha: fecha, tiempo: anivTiempo_(n), titulo: custom && custom[1] ? custom[1] : base.titulo, texto: custom ? custom[2] : base.texto, personalizada: !!custom };
}
function anivGuardar_(d) {
  var n = Math.round(Number(d.n)); if (!(n >= 1 && n <= 600)) return { ok: false, error: 'datos' };
  var sh = hojaAuto_(HOJA_ANIV, CAB_ANIV), texto = String(d.texto == null ? '' : d.texto).replace(/\r/g, '').trim().slice(0, 3000);
  if (!texto) { borrarFila_(HOJA_ANIV, String(n)); return { ok: true }; }
  upsertFila_(sh, String(n), [String(n), texto_(d.titulo, 100), texto]);
  return { ok: true };
}

// ---------------- CARTA DEL DÍA POR CORREO (el texto va dentro del correo; sin enlaces) ----------------
function cartaDeHoy_(hoy, ultima) {
  var f = filas_(HOJA_CARTAS), mejor = null;
  for (var i = 0; i < f.length; i++) {
    if (!fechaOk_(f[i][0]) || !String(f[i][2]).trim()) continue;
    if (f[i][0] === hoy) return { fecha: f[i][0], titulo: f[i][1], texto: f[i][2] };
    if (ultima && f[i][0] < hoy && (!mejor || f[i][0] > mejor.fecha)) mejor = { fecha: f[i][0], titulo: f[i][1], texto: f[i][2] };
  }
  return ultima ? mejor : null;
}
function enviarCartaDelDia_(forzarRol) {
  var cfg = leerConfig_(), hoy = hoy_();
  if (!forzarRol && !funciones_(cfg).correo_carta) return 0;
  var c = cartaDeHoy_(hoy, !!forzarRol);
  if (!c) return 0;
  var dest = forzarRol || (['ella', 'yo', 'ambos'].indexOf(String(cfg.carta_correo_a)) >= 0 ? String(cfg.carta_correo_a) : 'ella');
  var props = PropertiesService.getScriptProperties(), enviados = [];
  try { enviados = JSON.parse(props.getProperty('ENVIADOS') || '[]'); } catch (x) { enviados = []; }
  var clave = 'carta|' + c.fecha + '|' + dest;
  if (!forzarRol && enviados.indexOf(clave) >= 0) return 0;
  var n = enviar_(dest, '💌 ' + (c.titulo || 'Tu carta de hoy'), (c.titulo ? c.titulo + '\n\n' : '') + c.texto, { icono: '&#128140;', titulo: c.titulo || 'Tu carta de hoy', cuando: 'Carta de hoy', fecha: fechaLarga_(c.fecha), texto: c.texto, alinear: 'left' });
  if (!forzarRol) { enviados.push(clave); props.setProperty('ENVIADOS', JSON.stringify(enviados.slice(-300))); registrar_('carta_correo', 'enviados: ' + n); }
  return n;
}
function cartaCorreoPrueba_(d) {
  var rol = (d && (d.rol === 'yo' || d.rol === 'ella' || d.rol === 'ambos')) ? d.rol : 'yo';
  var c = correos_();
  if (rol === 'ambos' ? (!c.yo && !c.ella) : !c[rol]) return { ok: false, error: 'sin-correos' };
  var n;
  try { n = enviarCartaDelDia_(rol); } catch (x) { registrar_('carta_correo_prueba', 'ERROR: ' + x); return { ok: false, error: 'envio', detalle: String(x).slice(0, 300) }; }
  if (!n) return { ok: false, error: 'sin-carta' };
  var cuota = null; try { cuota = MailApp.getRemainingDailyQuota(); } catch (q) {}
  return { ok: true, enviados: n, cuota: cuota };
}

// ---------------- ESTADO DEL SISTEMA + DATOS A PRUEBA DE IDIOMA ----------------
var HOJAS_ESPERADAS = ['CONFIGURACION', 'EVENTOS', 'CARTA_12', 'REGISTRO', 'LUGARES', 'FOTOS', 'CATEGORIAS', 'FAVORITOS', 'FECHAS', 'CORREOS', 'CARTAS', 'PENDIENTES'];
function fechaIso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, libro_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim(), m;
  if (fechaOk_(s)) return s;
  if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s))) return m[3] + '-' + pad2_(Number(m[2])) + '-' + pad2_(Number(m[1]));
  return '';
}
/** Columnas de fecha por hoja: [hoja, columna (1..n), permitir vacío] */
var COL_FECHAS = [[HOJA_FECHAS, 3, false], [HOJA_CARTAS, 1, false], [HOJA_FOTOS, 3, true], [HOJA_CAPSULAS, 5, false], [HOJA_CANCIONES, 5, true], [HOJA_METAS, 4, true]];
function validarDatos_() {
  var out = [];
  function add(nivel, hoja, detalle) { out.push({ nivel: nivel, hoja: hoja, detalle: detalle }); }
  var ss = libro_(), loc = ''; try { loc = ss.getSpreadsheetLocale(); } catch (e) {}
  // Lugares
  try {
    var sh = ss.getSheetByName(HOJA_LUGARES);
    if (sh && sh.getLastRow() > 1) {
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
      vals.forEach(function (r) {
        if (!r[0]) return;
        var rla = typeof r[2] === 'number' ? r[2] : Number(String(r[2]).replace(',', '.')), rlo = typeof r[3] === 'number' ? r[3] : Number(String(r[3]).replace(',', '.'));
        if (String(r[2]).trim() === '' || String(r[3]).trim() === '' || !isFinite(rla) || !isFinite(rlo)) add('error', 'LUGARES', '"' + r[1] + '": falta la ubicación. Edítalo y pega el enlace de Google Maps.');
        else if (Math.abs(rla) > 90 || Math.abs(rlo) > 180) add('aviso', 'LUGARES', '"' + r[1] + '": coordenadas con el punto decimal perdido (el sitio las compensa; usa "Reparar datos" para dejarlas limpias).');
      });
    }
  } catch (e) { add('aviso', 'LUGARES', 'No se pudo revisar: ' + e); }
  // Fechas
  COL_FECHAS.forEach(function (c) {
    try {
      var sh2 = ss.getSheetByName(c[0]); if (!sh2 || sh2.getLastRow() < 2) return;
      var malas = 0, ej = '';
      sh2.getRange(2, c[1], sh2.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
        var s = String(r[0]).trim();
        if (!s) return;
        if (!fechaOk_(s)) { malas++; if (!ej) ej = s; }
      });
      if (malas) add('aviso', c[0], malas + ' fecha(s) con formato raro' + (ej ? ' (ej.: "' + ej + '")' : '') + '. Usa "Reparar datos".');
    } catch (e) {}
  });
  // Correos y configuración
  var co = correos_();
  ['yo', 'ella'].forEach(function (k) { if (co[k] && !emailOk_(co[k])) add('error', 'CORREOS', 'El correo de "' + k + '" no parece válido.'); });
  var cfg = leerConfig_();
  if (cfg.fecha_inicio && !fechaOk_(String(cfg.fecha_inicio))) add('error', 'CONFIGURACION', 'fecha_inicio no tiene formato AAAA-MM-DD.');
  if (/^(es|pt|fr|de|it)/i.test(loc)) add('info', 'HOJA', 'La hoja usa idioma "' + loc + '" (coma decimal). El sitio ya lo compensa; si algo se ve raro, usa "Reparar datos".');
  return out;
}
function sistemaEstado_() {
  var hoy = hoy_(), cfg = leerConfig_(), P = PropertiesService.getScriptProperties(), ch = [];
  function c(n, t, d) { ch.push({ n: n, t: t, d: d }); }
  var ss = libro_(), hojas = {};
  ss.getSheets().forEach(function (s) { hojas[s.getName()] = Math.max(0, s.getLastRow() - 1); });
  var faltan = HOJAS_ESPERADAS.filter(function (h) { return !(h in hojas); });
  c(faltan.length ? 'error' : 'ok', 'Hojas de datos', faltan.length ? 'Faltan: ' + faltan.join(', ') + '. Ejecuta inicializar().' : 'Todas las hojas existen (' + Object.keys(hojas).length + ').');
  var trig = []; try { trig = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); } catch (e) {}
  c(trig.indexOf('enviarRecordatorios') >= 0 ? 'ok' : 'aviso', 'Avisos diarios (8:00 a. m.)', trig.indexOf('enviarRecordatorios') >= 0 ? 'Activos.' : 'Apagados: actívalos en Admin → Correos.');
  var cuota = null; try { cuota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  c(cuota == null ? 'aviso' : cuota < 10 ? 'aviso' : 'ok', 'Cuota de correos de hoy', cuota == null ? 'No se pudo leer (¿falta permiso?).' : 'Quedan ' + cuota + '.');
  var co = correos_();
  c(co.yo && co.ella ? 'ok' : 'aviso', 'Correos guardados', 'Yo: ' + (co.yo ? 'sí' : 'falta') + ' · Ella: ' + (co.ella ? 'sí' : 'falta') + '.');
  c(P.getProperty('SITE_KEY') || P.getProperty('ADMIN_KEY') ? 'ok' : 'aviso', 'Contraseña de Admin', P.getProperty('SITE_KEY') || P.getProperty('ADMIN_KEY') ? 'Personalizada.' : 'Usas la contraseña por defecto (3457). Cámbiala creando SITE_KEY en Propiedades de la secuencia de comandos.');
  c(esVerdadero_(cfg.habilitado_12) ? 'info' : 'ok', 'Sorpresa del 12', esVerdadero_(cfg.habilitado_12) ? 'DESBLOQUEADA.' : 'Bloqueada.');
  var f = funciones_(cfg);
  c('info', 'Cartas por correo', f.correo_carta ? 'Activadas (a: ' + (cfg.carta_correo_a || 'ella') + ').' : 'Apagadas.');
  var datos = []; if (f.validar) { try { datos = validarDatos_(); } catch (e) { datos = [{ nivel: 'aviso', hoja: '-', detalle: 'La validación falló: ' + e }]; } }
  // últimos errores de la bitácora
  var errores = [];
  try {
    var rg = ss.getSheetByName(HOJA_REGISTRO);
    if (rg && rg.getLastRow() > 1) {
      var n = Math.min(60, rg.getLastRow() - 1);
      rg.getRange(rg.getLastRow() - n + 1, 1, n, 3).getDisplayValues().forEach(function (r) { if (/ERROR|RECHAZADO/i.test(String(r[2]))) errores.push({ cuando: r[0], accion: r[1], detalle: String(r[2]).slice(0, 200) }); });
      errores = errores.slice(-8).reverse();
    }
  } catch (e) {}
  return { ok: true, version: VERSION_SITIO, hoy: hoy, rol: ROL_, checks: ch, datos: datos, errores: errores, hojas: hojas, fn: f };
}
function sistemaReparar_() {
  var ss = libro_(), cont = 0;
  // 1) Coordenadas de LUGARES, como texto limpio con punto decimal
  var lug = ss.getSheetByName(HOJA_LUGARES);
  if (lug && lug.getLastRow() > 1) {
    var n = lug.getLastRow() - 1, rg = lug.getRange(2, 3, n, 2), raw = rg.getValues(), out = [];
    lug.getRange(1, 3, Math.max(lug.getMaxRows(), 2), 2).setNumberFormat('@');
    raw.forEach(function (r) {
      var la = coord_(r[0], 90), lo = coord_(r[1], 180), nuevo = [isFinite(la) ? String(la) : String(r[0]), isFinite(lo) ? String(lo) : String(r[1])];
      if (nuevo[0] !== String(r[0]) || nuevo[1] !== String(r[1]) || typeof r[0] === 'number') cont++;
      out.push(nuevo);
    });
    rg.setValues(out);
  }
  // 2) Fechas: todo a texto AAAA-MM-DD
  COL_FECHAS.forEach(function (c) {
    var sh = ss.getSheetByName(c[0]); if (!sh || sh.getLastRow() < 2) return;
    var m = sh.getLastRow() - 1, rg2 = sh.getRange(2, c[1], m, 1), raw2 = rg2.getValues(), out2 = [], cambio = false;
    sh.getRange(1, c[1], Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
    raw2.forEach(function (r) {
      var iso = fechaIso_(r[0]), orig = (Object.prototype.toString.call(r[0]) === '[object Date]') ? null : String(r[0]);
      if (iso && iso !== orig) { cambio = true; cont++; out2.push([iso]); } else out2.push([orig == null ? '' : orig]);
    });
    if (cambio) rg2.setValues(out2);
  });
  CacheService.getScriptCache().remove('hub_v1');
  registrar_('sistema_reparar', 'OK: ' + cont + ' cambio(s)');
  return { ok: true, reparados: cont };
}


// ============================ FASE 4: subir fotos desde el administrador ============================
/** Decodifica un JPEG en base64 comprobando su firma y su tamaño. */
function jpegBytes_(b64, max) {
  var limpio = String(b64 || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!limpio || limpio.length > MAX_UPLOAD) return { error: 'tamano' };
  var bytes;
  try { bytes = Utilities.base64Decode(limpio); } catch (x) { return { error: 'datos' }; }
  if (bytes.length > max || bytes.length < 200) return { error: 'tamano' };
  if ((bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216 || (bytes[2] & 255) !== 255) return { error: 'tipo' };
  return { bytes: bytes };
}
/** El administrador sube una foto (más su miniatura) a la carpeta privada de Drive y queda publicada con sus datos. */
function fotoSubir_(d) {
  if (!limitar_('subir', 80, 3600)) return { ok: false, error: 'limite' };
  var fecha = texto_(d.fecha, 10);
  if (fecha && !fechaOk_(fecha)) return { ok: false, error: 'fecha' };
  var grande = jpegBytes_(d.imagen, MAX_FOTO_BYTES);
  if (grande.error) return { ok: false, error: grande.error };
  var mini = d.miniatura ? jpegBytes_(d.miniatura, 80000) : null;
  if (mini && mini.error) mini = null;                              // sin miniatura sigue funcionando (se usa la grande)
  var cats = (Array.isArray(d.categorias) ? d.categorias : []).map(function (c) { return texto_(c, 30).replace(/,/g, ''); }).filter(String).slice(0, 8).join(', ');
  var id = 'a' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  var carpeta = carpetaFotos_();
  var f = carpeta.createFile(Utilities.newBlob(grande.bytes, 'image/jpeg', id + '.jpg'));
  var mid = mini ? carpeta.createFile(Utilities.newBlob(mini.bytes, 'image/jpeg', id + '_mini.jpg')).getId() : '';
  hoja_(HOJA_FOTOS).appendRow(['drive_' + f.getId(), texto_(d.lugar_id, 40), fecha, cats, texto_(d.nota, 300), mid]);
  return { ok: true, id: f.getId() };
}
/** Quita una foto del sitio. Si está en Drive, también va a la papelera (foto y miniatura). */
function fotoBorrar_(d) {
  var archivo = texto_(d.archivo, 80);
  if (!archivoOk_(archivo)) return { ok: false, error: 'datos' };
  var sh = hoja_(HOJA_FOTOS), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === archivo) {
    if (archivo.indexOf('drive_') === 0) {
      [archivo.slice(6), String(v[i][5] || '')].forEach(function (id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) { console.error('papelera: ' + x); } } });
    }
    sh.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'datos' };
}
