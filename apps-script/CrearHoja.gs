/**
 * ARCHIVO TEMPORAL — crea la hoja de cálculo si no existe y muestra su link.
 * Úsalo en el MISMO proyecto de Apps Script donde está Code.gs (como un archivo más).
 * Ejecuta crearHojaSiNoExiste(), acepta los permisos y mira el link en Ver → Registros.
 * Cuando termines puedes borrar este archivo.
 */
var NOMBRE_HOJA_LIBRO = 'NUESTRO RINCON';

function crearHojaSiNoExiste() {
  var props = PropertiesService.getScriptProperties();
  var ss = null, estado = '';

  // 1) ¿el script ya está ligado a una hoja (creado desde Extensiones → Apps Script)?
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss) estado = 'El script está ligado a esta hoja.'; } catch (e) { ss = null; }

  // 2) ¿ya hay una guardada en SHEET_ID?
  if (!ss) {
    var id = props.getProperty('SHEET_ID');
    if (id) { try { ss = SpreadsheetApp.openById(id); estado = 'Ya existía (SHEET_ID guardado).'; } catch (e) { ss = null; } }
  }

  // 3) ¿existe una con ese nombre en tu Drive?
  if (!ss) {
    var it = DriveApp.getFilesByName(NOMBRE_HOJA_LIBRO);
    while (it.hasNext()) {
      var f = it.next();
      if (f.getMimeType() === MimeType.GOOGLE_SHEETS && !f.isTrashed()) { ss = SpreadsheetApp.openById(f.getId()); estado = 'Ya existía en tu Drive.'; break; }
    }
  }

  // 4) no existe: se crea
  if (!ss) { ss = SpreadsheetApp.create(NOMBRE_HOJA_LIBRO); estado = 'Hoja NUEVA creada.'; }

  props.setProperty('SHEET_ID', ss.getId());

  // crea las pestañas del sitio (si Code.gs está en el proyecto)
  var tabs = '';
  try { if (typeof inicializar === 'function') { inicializar(); tabs = ' Pestañas del sitio listas (inicializar).'; } } catch (e) { tabs = ' Aviso al inicializar: ' + e; }

  var url = ss.getUrl();
  Logger.log(estado + tabs);
  Logger.log('LINK DE LA HOJA: ' + url);
  Logger.log('SHEET_ID guardado: ' + ss.getId());
  return url;
}
