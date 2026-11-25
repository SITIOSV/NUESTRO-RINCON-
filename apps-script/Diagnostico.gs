/**
 * ARCHIVO TEMPORAL — revisa por qué no salen los datos.
 * Pégalo como archivo nuevo en el MISMO proyecto de Apps Script, ejecuta diagnostico()
 * y copia aquí todo lo que salga en Ver → Registros.
 */
function diagnostico() {
  var out = [], props = {};
  try { props = PropertiesService.getScriptProperties().getProperties(); } catch (e) {}
  out.push('1) ¿Está Code.gs en este proyecto? doGet: ' + (typeof doGet === 'function' ? 'SÍ' : 'NO  <-- AQUÍ ESTÁ EL PROBLEMA, pega Code.gs'));
  out.push('   inicializar: ' + (typeof inicializar === 'function' ? 'SÍ' : 'NO') + ' | autorizar: ' + (typeof autorizar === 'function' ? 'SÍ' : 'NO'));
  out.push('2) Propiedades guardadas: ' + (Object.keys(props).join(', ') || '(ninguna)'));
  out.push('   SHEET_ID = ' + (props.SHEET_ID || '(vacío)'));
  var ss = null;
  try { ss = (typeof libro_ === 'function') ? libro_() : SpreadsheetApp.openById(props.SHEET_ID); } catch (e) { out.push('3) NO se pudo abrir la hoja: ' + e); }
  if (ss) {
    out.push('3) Hoja que usa el sitio: "' + ss.getName() + '"  ' + ss.getUrl());
    var esperadas = ['CONFIGURACION', 'EVENTOS', 'CARTA_12', 'REGISTRO', 'LUGARES', 'FOTOS', 'CATEGORIAS', 'FAVORITOS', 'FECHAS', 'CORREOS', 'CARTAS', 'PENDIENTES'], hay = {};
    ss.getSheets().forEach(function (sh) { hay[sh.getName()] = Math.max(0, sh.getLastRow() - 1); });
    esperadas.forEach(function (n) { out.push('   ' + (n in hay ? 'OK   ' : 'FALTA') + ' ' + n + (n in hay ? ': ' + hay[n] + ' filas de datos' : '  (corre inicializar())')); });
  }
  if (typeof doGet === 'function') {
    ['estado', 'hub'].forEach(function (a) {
      try { var r = doGet({ parameter: { action: a } }).getContent(); out.push('4) doGet ' + a + ' -> ' + r.slice(0, 220) + (r.length > 220 ? '…' : '')); }
      catch (e) { out.push('4) doGet ' + a + ' FALLÓ: ' + e); }
    });
  }
  Logger.log('\n' + out.join('\n'));
}


/**
 * Ejecuta esta función desde el editor (▶) para probar el envío de correos.
 * Si Google pide permisos, acéptalos (eso suele ser lo que arregla el problema).
 * Luego mira Ver → Registros.
 */
function diagnosticoCorreo() {
  var out = [];
  try { out.push('Cuota restante hoy: ' + MailApp.getRemainingDailyQuota()); } catch (e) { out.push('Cuota FALLÓ: ' + e); }
  try { var c = correos_(); out.push('Correos guardados -> yo: ' + (c.yo || '(vacío)') + ' | ella: ' + (c.ella || '(vacío)')); } catch (e) { out.push('Leer correos FALLÓ: ' + e); }
  try { out.push('Disparador diario: ' + ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviarRecordatorios'; })); } catch (e) { out.push('Disparadores FALLÓ: ' + e); }
  try { var me = correos_().yo || correos_().ella; if (!me) throw new Error('No hay correos guardados en la hoja CORREOS'); mandar_(me, 'Prueba de diagnóstico', 'Si ves esto, el envío funciona.', { titulo: 'Prueba', texto: 'Envío OK' }); out.push('Envío a ' + me + ': OK'); }
  catch (e) { out.push('Envío FALLÓ: ' + e); }
  Logger.log('\n' + out.join('\n'));
}
