// Revisa que el código esté sano antes de subirlo: sintaxis + funciones imprescindibles + páginas + caché del service worker.
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const raiz = path.join(__dirname, '..'); let fallos = 0;
const ok = (m) => console.log('  ✔ ' + m), mal = (m) => { fallos++; console.log('  ✘ ' + m); };
const gs = fs.readFileSync(path.join(raiz, 'apps-script/Code.gs'), 'utf8');
const tmp = path.join(os.tmpdir(), 'rincon_chk.js'); fs.writeFileSync(tmp, gs);
try { cp.execSync('node --check "' + tmp + '"', { stdio: 'pipe' }); ok('Code.gs: sintaxis correcta'); } catch (e) { mal('Code.gs: error de sintaxis\n' + String(e.stderr || e)); }
const exigidas = ['doGet', 'doPost', 'hubPost_', 'autorizarAdmin_', 'enviarRecordatorios', 'correoHtml_', 'sistemaEstado_', 'validarDatos_', 'funciones_', 'metaToggle_', 'capsulaCrear_', 'anivCarta_', 'cartaDeHoy_', 'configGuardar_', 'autorizar', 'inicializar'];
const faltan = exigidas.filter((f) => !new RegExp('function\\s+' + f + '\\s*\\(').test(gs));
faltan.length ? mal('Code.gs: faltan funciones: ' + faltan.join(', ')) : ok('Code.gs: ' + exigidas.length + ' funciones clave presentes');
const js = path.join(raiz, 'sitio/hub.js');
try { cp.execSync('node --check "' + js + '"', { stdio: 'pipe' }); ok('hub.js: sintaxis correcta'); } catch (e) { mal('hub.js: error de sintaxis\n' + String(e.stderr || e)); }
const sw = fs.readFileSync(path.join(raiz, 'sitio/sw.js'), 'utf8');
/rincon-v\d+/.test(sw) ? ok('sw.js: ' + sw.match(/rincon-v\d+/)[0] + ' (súbelo de número en cada versión)') : mal('sw.js: falta el nombre de caché');
const paginas = (sw.match(/'[\w-]+\.html'/g) || []).map((x) => x.slice(1, -1));
const sin = paginas.filter((p) => !fs.existsSync(path.join(raiz, 'sitio', p)));
sin.length ? mal('sw.js lista páginas que no existen: ' + sin.join(', ')) : ok(paginas.length + ' páginas del service worker existen');
const htmls = fs.readdirSync(path.join(raiz, 'sitio')).filter((f) => f.endsWith('.html'));
const sinFrame = htmls.filter((f) => !/frame-src https:\/\/www\.google\.com/.test(fs.readFileSync(path.join(raiz, 'sitio', f), 'utf8')) && f !== 'index.html' && f !== 'regalo.html');
sinFrame.length ? mal('Estas páginas no permiten el mapa de Google (CSP): ' + sinFrame.join(', ')) : ok('CSP con mapa de Google en las páginas del hub');
console.log(fallos ? '\nHay ' + fallos + ' problema(s).' : '\nTodo en orden ✔'); process.exit(fallos ? 1 : 0);
