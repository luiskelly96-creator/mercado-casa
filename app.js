// ===== Mi Casa — app.js (v3.1 · cola + caché) =====

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  vista: 'despensa',
  usuario: null,
  productos: [], lista: [], contactos: [], categorias: [], ubicaciones: [], catContactos: [],
  fProd: { q: '', categoria: '', ubicacion: '' },
  fCon: { q: '', categoria: '' },
  filtrosProd: false,
  filtrosCon: false
};

/* ---------- Configuración ---------- */
const cfg = {
  get api() { return (window.MERCADO_CONFIG && window.MERCADO_CONFIG.API_URL) || ''; },
  get clientId() { return (window.MERCADO_CONFIG && window.MERCADO_CONFIG.CLIENT_ID) || ''; },
  get session() { return localStorage.getItem('mc_session') || ''; },
  get nombre() { return localStorage.getItem('mc_nombre') || ''; },
  get email() { return localStorage.getItem('mc_email') || ''; },
  get token() { return localStorage.getItem('mc_token') || ''; },
  iniciarSesion(s, e, n) { localStorage.setItem('mc_session', s); localStorage.setItem('mc_email', e || ''); localStorage.setItem('mc_nombre', n || ''); },
  cerrarSesion() { ['mc_session', 'mc_email', 'mc_nombre'].forEach(k => localStorage.removeItem(k)); },
  guardarToken(t) { localStorage.setItem('mc_token', t || ''); }
};

/* ---------- API ---------- */
async function apiGet(action) {
  const url = cfg.api + '?action=' + encodeURIComponent(action) + '&session=' + encodeURIComponent(cfg.session) + '&token=' + encodeURIComponent(cfg.token) + '&_=' + Date.now();
  return (await fetch(url)).json();
}
async function apiPost(action, data) {
  const res = await fetch(cfg.api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, session: cfg.session, token: cfg.token, data: data || {} })
  });
  return res.json();
}

/* ---------- Utilidades ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const quien = () => state.usuario ? (state.usuario.nombre || state.usuario.email) : '';
const opt = (v, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`;
const normalizarProducto = p => ({ id: p.id, nombre: p.nombre || '', categoria: p.categoria || '', ubicacion: p.ubicacion || '', descripcion: p.descripcion || '', disponible: !(String(p.disponible).toLowerCase() === 'false') });
const normalizarContacto = c => ({ id: c.id, nombre: c.nombre || '', indicativo: c.indicativo || '', numero: c.numero || '', categoria: c.categoria || '', descripcion: c.descripcion || '' });
const normalizarLista = i => ({ id: i.id, producto: i.producto || '', estado: i.estado === 'comprado' ? 'comprado' : 'pendiente', quien: i.quien || '', nota: i.nota || '' });
const igualProd = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const enListaPendiente = (nombre) => state.lista.some(i => i.estado !== 'comprado' && igualProd(i.producto, nombre));

const PAISES = ['+57', '+1', '+52', '+54', '+56', '+51', '+58', '+593', '+591', '+595', '+598', '+507', '+506', '+502', '+503', '+504', '+505', '+53', '+1809', '+34'];

let toastTimer;
function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ver ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ---------- Caché local (carga instantánea) ---------- */
function guardarCache() {
  try {
    localStorage.setItem('mc_cache', JSON.stringify({
      productos: state.productos, lista: state.lista, contactos: state.contactos,
      categorias: state.categorias, ubicaciones: state.ubicaciones, catContactos: state.catContactos
    }));
  } catch (e) {}
}
function leerCache() {
  try {
    const c = JSON.parse(localStorage.getItem('mc_cache') || 'null');
    if (!c) return false;
    state.productos = c.productos || [];
    state.lista = c.lista || [];
    state.contactos = c.contactos || [];
    state.categorias = c.categorias || [];
    state.ubicaciones = c.ubicaciones || [];
    state.catContactos = c.catContactos || [];
    return true;
  } catch (e) { return false; }
}

/* ---------- Cola de escritura (no revierte, serializada) ---------- */
const cola = [];
let procesando = false;
let pendientes = 0;

function enqueue(tarea) {
  return new Promise(resolve => {
    cola.push({ tarea, resolve });
    if (!procesando) procesar();
  });
}
async function procesar() {
  procesando = true;
  while (cola.length) {
    const item = cola.shift();
    pendientes++; document.body.classList.add('guardando');
    try { item.resolve({ ok: true, r: await item.tarea() }); }
    catch (e) { toast(e.message, 'error'); item.resolve({ ok: false, error: e.message }); }
    pendientes--; if (pendientes <= 0) document.body.classList.remove('guardando');
  }
  procesando = false;
}
// Encola una llamada al servidor (con 1 reintento por red). El id se lee al ejecutar.
function encolar(action, dataFn) {
  return enqueue(async () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    let r;
    try { r = await apiPost(action, data); }
    catch (e) { r = await apiPost(action, data); }
    if (r && r.codigo === 'AUTH') { cfg.cerrarSesion(); state.usuario = null; irA('login'); throw new Error('Sesión expirada'); }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Error al guardar');
    return r;
  });
}
const hayPendientes = () => procesando || cola.length > 0;

/* ---------- Arranque ---------- */
function init() {
  $('#btnSync').addEventListener('click', () => cargar(true));
  $$('.tab').forEach(t => t.addEventListener('click', () => irA(t.dataset.vista)));
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);

  if (!cfg.api) { toast('Falta configurar la API', 'error'); return; }
  if (!cfg.session && !cfg.token) { irA('login'); return; }
  leerCache();
  irA('despensa');
  cargar();
}

function irA(vista) {
  state.vista = vista;
  $$('.tab').forEach(t => {
    t.classList.toggle('activo', t.dataset.vista === vista);
    t.style.display = (vista === 'login' && t.dataset.vista !== 'ajustes') ? 'none' : '';
  });
  render();
}

function render() {
  const v = $('#vista');
  if (state.vista === 'login') { v.innerHTML = vistaLogin(); initGSI(); return; }
  if (!state.usuario && !cfg.session && !cfg.token) { state.vista = 'login'; v.innerHTML = vistaLogin(); initGSI(); return; }
  const foco = document.activeElement && document.activeElement.id ? { id: document.activeElement.id, pos: document.activeElement.selectionStart } : null;
  if (state.vista === 'despensa') v.innerHTML = vistaDespensa();
  else if (state.vista === 'lista') v.innerHTML = vistaLista();
  else if (state.vista === 'contactos') v.innerHTML = vistaContactos();
  else v.innerHTML = vistaAjustes();
  guardarCache();
  if (foco && foco.id) { const el = document.getElementById(foco.id); if (el) { el.focus(); try { el.setSelectionRange(foco.pos, foco.pos); } catch (e) {} } }
}

/* ---------- Datos ---------- */
function aplicarDatos(r) {
  state.productos = (r.productos || []).map(normalizarProducto);
  state.lista = (r.lista || []).map(normalizarLista);
  state.contactos = (r.contactos || []).map(normalizarContacto);
  state.categorias = (r.categorias || []).map(c => c.nombre).filter(Boolean);
  state.ubicaciones = (r.ubicaciones || []).map(c => c.nombre).filter(Boolean);
  state.catContactos = (r.catContactos || []).map(c => c.nombre).filter(Boolean);
  state.usuario = r.usuario || { nombre: cfg.nombre, email: cfg.email };
}

async function cargar(manual) {
  if (!cfg.session && !cfg.token) { irA('login'); return; }
  if (manual) { document.body.classList.add('guardando'); }
  try {
    let r = await apiGet('getAll');
    if (r && r.codigo === 'AUTH') { cfg.cerrarSesion(); state.usuario = null; return irA('login'); }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Respuesta inválida');
    if (hayPendientes()) return; // no pisar cambios en curso
    aplicarDatos(r);

    // Si hay filas pegadas a mano en la Hoja sin id, la app los asigna.
    if (r.sinId > 0) {
      await apiPost('producto.saneamiento', {});
      const r2 = await apiGet('getAll');
      if (r2 && r2.ok) aplicarDatos(r2);
    }
    render();
  } catch (e) { toast('No se pudo conectar: ' + e.message, 'error'); }
  document.body.classList.remove('guardando');
}

/* ================= LOGIN ================= */
function vistaLogin() {
  return `
    <div class="card centro">
      <div class="logo-grande">🏠</div>
      <h2>Mi Casa</h2>
      <p class="ayuda">Entra con tu cuenta de Google autorizada.</p>
      <div id="gbtn" class="gbtn"></div>
    </div>
    <div class="card">
      <h2>¿No puedes entrar?</h2>
      <p class="ayuda">Tu correo debe estar autorizado en la pestaña <b>usuarios</b> de la Hoja de Google.</p>
      <button class="btn sec" data-ir="ajustes">Opciones avanzadas</button>
    </div>`;
}
let gsiInited = false;
function initGSI() {
  if (!cfg.clientId || cfg.clientId.indexOf('PENDIENTE') === 0) return;
  if (!(window.google && window.google.accounts && window.google.accounts.id)) { setTimeout(initGSI, 200); return; }
  try {
    if (!gsiInited) { google.accounts.id.initialize({ client_id: cfg.clientId, callback: onCredential }); gsiInited = true; }
    const el = document.getElementById('gbtn');
    if (el) google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', width: 260, text: 'signin_with', locale: 'es' });
  } catch (e) { setTimeout(initGSI, 400); }
}
async function onCredential(resp) {
  if (!resp || !resp.credential) return;
  try {
    const r = await apiPost('login', { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || 'No autorizado');
    cfg.iniciarSesion(r.session, r.email, r.nombre);
    state.usuario = { email: r.email, nombre: r.nombre };
    toast('Bienvenido, ' + (r.nombre || r.email), 'ok');
    irA('despensa'); cargar();
  } catch (e) { toast(e.message, 'error'); }
}

/* ================= MÓDULO: DESPENSA ================= */
function vistaDespensa() {
  const f = state.fProd;
  const q = f.q.trim().toLowerCase();
  let items = state.productos.filter(p =>
    (!q || p.nombre.toLowerCase().includes(q)) &&
    (!f.categoria || p.categoria === f.categoria) &&
    (!f.ubicacion || p.ubicacion === f.ubicacion));
  items.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const activos = (f.categoria ? 1 : 0) + (f.ubicacion ? 1 : 0) + (q ? 1 : 0);

  const fila = p => `
    <div class="prod" data-editprod="${esc(p.id)}">
      <div class="prod-main">
        <div class="prod-nombre">${esc(p.nombre)}</div>
        <div class="prod-chips">
          ${p.categoria ? `<span class="chip">${esc(p.categoria)}</span>` : ''}
          ${p.ubicacion ? `<span class="chip ghost">${esc(p.ubicacion)}</span>` : ''}
        </div>
        ${p.descripcion ? `<div class="prod-desc"><b>Descripción:</b> ${esc(p.descripcion)}</div>` : ''}
      </div>
      <div class="prod-lado">
        <button class="estado ${p.disponible ? 'ok' : 'no'}" data-disp="${esc(p.id)}">${p.disponible ? 'Disponible' : 'No disponible'}</button>
        ${!p.disponible ? (enListaPendiente(p.nombre)
          ? '<span class="chip enLista">En lista</span>'
          : `<button class="btn sec mini" data-alista="${esc(p.id)}">＋ Lista</button>`) : ''}
      </div>
    </div>`;

  return `
    <div class="mod-head">
      <h2>Despensa <span class="cont">${items.length}</span></h2>
      <div class="mod-acciones">
        <button class="btn sec mini ${state.filtrosProd ? 'on' : ''}" data-togglefiltros="prod">Filtros${activos ? ' (' + activos + ')' : ''}</button>
        <button class="btn sec mini" data-importar="1">Importar</button>
        <button class="btn mini" data-nuevoprod="1">+ Nuevo</button>
      </div>
    </div>

    ${state.filtrosProd ? `
    <div class="filtros">
      <input id="fq" placeholder="Buscar por nombre" value="${esc(state.fProd.q)}">
      <select id="fc">${opt('', 'Categoría')}${state.categorias.map(c => opt(c, state.fProd.categoria)).join('')}</select>
      <select id="fu">${opt('', 'Ubicación')}${state.ubicaciones.map(c => opt(c, state.fProd.ubicacion)).join('')}</select>
      ${activos ? '<button class="btn sec mini" data-limpiafiltros="prod">Limpiar filtros</button>' : ''}
    </div>` : ''}

    <div class="lista">
      ${items.length ? items.map(fila).join('') : '<p class="vacio">No hay productos. Crea uno con “+ Nuevo”.</p>'}
    </div>`;
}

/* ================= MÓDULO: LISTA ================= */
function categoriaDe(nombre) {
  const p = state.productos.find(x => igualProd(x.nombre, nombre));
  return (p && p.categoria) ? p.categoria : 'Sin categoría';
}
function agruparPorCategoria(items) {
  const orden = state.categorias;
  const grupos = new Map();
  items.forEach(i => {
    const c = categoriaDe(i.producto);
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(i);
  });
  const claves = Array.from(grupos.keys()).sort((a, b) => {
    if (a === 'Sin categoría') return 1;
    if (b === 'Sin categoría') return -1;
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return claves.map(c => ({ categoria: c, items: grupos.get(c) }));
}

function vistaLista() {
  const pend = state.lista.filter(i => i.estado !== 'comprado');
  const comp = state.lista.filter(i => i.estado === 'comprado');
  const item = i => `
    <div class="item ${i.estado === 'comprado' ? 'comprado' : ''}">
      <button class="check ${i.estado === 'comprado' ? 'on' : ''}" data-togglalista="${esc(i.id)}">${i.estado === 'comprado' ? '✓' : ''}</button>
      <div class="info">
        <div class="nombre">${esc(i.producto)}</div>
        ${i.nota ? `<div class="meta reco"><b>Recomendación:</b> ${esc(i.nota)}</div>` : ''}
        ${i.quien ? `<div class="meta">${esc(i.quien)}</div>` : ''}
      </div>
      <button class="btn sec mini" data-dellista="${esc(i.id)}">✕</button>
    </div>`;

  return `
    <div class="mod-head"><h2>Lista de mercado <span class="cont">${pend.length}</span></h2></div>
    <div class="card">
      <h2>Por comprar</h2>
      ${pend.length ? agruparPorCategoria(pend).map(g => `
        <div class="grupo">
          <div class="grupo-titulo">${esc(g.categoria)} <span class="cont">${g.items.length}</span></div>
          ${g.items.map(item).join('')}
        </div>`).join('') : '<p class="vacio">Nada pendiente.</p>'}
      <p class="ayuda" style="margin-top:10px">Los ítems se agregan desde <b>Despensa</b> cuando marcas algo como “No disponible”.</p>
    </div>
    ${comp.length ? `
    <div class="card">
      <h2>Comprados</h2>
      ${comp.map(item).join('')}
      <button class="btn sec" data-limpiarlista="1" style="margin-top:12px">Limpiar comprados</button>
    </div>` : ''}`;
}

/* ================= MÓDULO: CONTACTOS ================= */
function vistaContactos() {
  const f = state.fCon;
  const q = f.q.trim().toLowerCase();
  const qDig = q.replace(/\D/g, '');
  let items = state.contactos.filter(c =>
    (!f.categoria || c.categoria === f.categoria) &&
    (!q || c.nombre.toLowerCase().includes(q) || (qDig && (c.numero || '').replace(/\D/g, '').includes(qDig))));
  items.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const activos = (f.categoria ? 1 : 0) + (q ? 1 : 0);
  const tel = c => (c.indicativo || '') + (c.numero || '');

  const fila = c => `
    <div class="prod" data-editcon="${esc(c.id)}">
      <div class="prod-main">
        <div class="prod-nombre">${esc(c.nombre)}</div>
        <div class="prod-chips">${c.categoria ? `<span class="chip">${esc(c.categoria)}</span>` : ''}</div>
        ${c.descripcion ? `<div class="prod-desc"><b>Descripción:</b> ${esc(c.descripcion)}</div>` : ''}
      </div>
      ${c.numero ? `<a class="btn mini" href="tel:${esc(tel(c).replace(/\s/g, ''))}">📞 ${esc(tel(c))}</a>` : ''}
    </div>`;

  return `
    <div class="mod-head">
      <h2>Contactos <span class="cont">${items.length}</span></h2>
      <div class="mod-acciones">
        <button class="btn sec mini ${state.filtrosCon ? 'on' : ''}" data-togglefiltros="con">Filtros${activos ? ' (' + activos + ')' : ''}</button>
        <button class="btn mini" data-nuevocontacto="1">+ Nuevo</button>
      </div>
    </div>
    ${state.filtrosCon ? `
    <div class="filtros">
      <input id="fqC" placeholder="Buscar por nombre o número" value="${esc(state.fCon.q)}">
      <select id="fcC">${opt('', 'Categoría')}${state.catContactos.map(c => opt(c, state.fCon.categoria)).join('')}</select>
      ${activos ? '<button class="btn sec mini" data-limpiafiltros="con">Limpiar</button>' : ''}
    </div>` : ''}
    <div class="lista">
      ${items.length ? items.map(fila).join('') : '<p class="vacio">No hay contactos. Crea uno con “+ Nuevo”.</p>'}
    </div>`;
}

/* ================= MÓDULO: AJUSTES ================= */
function vistaAjustes() {
  const sesion = cfg.session || cfg.token;
  const bloque = (titulo, tipo, lista) => `
    <div class="card">
      <h2>${titulo}</h2>
      <div class="op-add">
        <input id="nuevo-${tipo}" placeholder="Agregar ${titulo.toLowerCase()}" autocomplete="off">
        <button class="btn mini" data-opadd="${tipo}">Añadir</button>
      </div>
      <div class="ops">
        ${lista.length ? lista.map(n => `
          <div class="op">
            <span>${esc(n)}</span>
            <span>
              <button class="btn sec mini" data-oprename="${tipo}" data-nombre="${esc(n)}">✏️</button>
              <button class="btn sec mini" data-opdel="${tipo}" data-nombre="${esc(n)}">✕</button>
            </span>
          </div>`).join('') : '<p class="vacio">Vacío.</p>'}
      </div>
    </div>`;

  return `
    <div class="card">
      <h2>Cuenta</h2>
      ${sesion ? `
        <p class="ayuda">Sesión activa:<br><b>${esc(state.usuario ? state.usuario.nombre : cfg.nombre)}</b><br>${esc(state.usuario ? state.usuario.email : cfg.email)}</p>
        <button class="btn danger" data-logout="1" style="margin-top:12px">Cerrar sesión</button>
      ` : `<p class="ayuda">No has iniciado sesión.</p><button class="btn" data-ir="login">Iniciar sesión con Google</button>`}
    </div>
    ${bloque('Categorías', 'categorias', state.categorias)}
    ${bloque('Ubicaciones', 'ubicaciones', state.ubicaciones)}
    ${bloque('Categorías de contactos', 'catContactos', state.catContactos)}
    <div class="card">
      <h2>Avanzado (dueño)</h2>
      <p class="ayuda">Solo mantenimiento.</p>
      <label class="campo">Token del dueño</label>
      <input id="inToken" placeholder="token" value="${esc(cfg.token)}">
      <div class="fila" style="margin-top:12px">
        <button class="btn" data-guardartoken="1">Guardar</button>
        <button class="btn sec" data-probar="1">Probar y crear hojas</button>
      </div>
    </div>`;
}

/* ================= MODALES ================= */
function abrirModal(titulo, cuerpo) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>${esc(titulo)}</h3><button class="modal-x" data-cerrarmodal="1">✕</button></div><div class="modal-body">${cuerpo}</div></div>`;
  m.classList.add('abierto');
}
function cerrarModal() { const m = $('#modal'); m.classList.remove('abierto'); m.innerHTML = ''; }

function modalProducto(p) {
  const edit = !!p;
  abrirModal(edit ? 'Editar producto' : 'Nuevo producto', `
    <form data-form="producto">
      <input type="hidden" name="id" value="${edit ? esc(p.id) : ''}">
      <label class="campo">Nombre *</label>
      <input name="nombre" placeholder="Ej: Arroz" required autocomplete="off" value="${edit ? esc(p.nombre) : ''}">
      <label class="campo">Categoría</label>
      <select name="categoria">${opt('', '— Sin categoría —')}${state.categorias.map(c => opt(c, edit ? p.categoria : '')).join('')}</select>
      <label class="campo">Ubicación</label>
      <select name="ubicacion">${opt('', '— Sin ubicación —')}${state.ubicaciones.map(c => opt(c, edit ? p.ubicacion : '')).join('')}</select>
      <label class="campo">Descripción</label>
      <textarea name="descripcion" rows="2" placeholder="Opcional">${edit ? esc(p.descripcion) : ''}</textarea>
      <div class="fila" style="margin-top:14px">
        <button class="btn" type="submit">${edit ? 'Guardar' : 'Crear'}</button>
        ${edit ? `<button class="btn danger" type="button" data-delprod="${esc(p.id)}">Eliminar</button>` : ''}
        <button class="btn sec" type="button" data-cerrarmodal="1">Cancelar</button>
      </div>
    </form>`);
}

function modalContacto(c) {
  const edit = !!c;
  abrirModal(edit ? 'Editar contacto' : 'Nuevo contacto', `
    <form data-form="contacto">
      <input type="hidden" name="id" value="${edit ? esc(c.id) : ''}">
      <label class="campo">Nombre *</label>
      <input name="nombre" placeholder="Ej: Don José" required autocomplete="off" value="${edit ? esc(c.nombre) : ''}">
      <label class="campo">Teléfono</label>
      <div class="fila">
        <select name="indicativo" style="max-width:110px">${PAISES.map(p => opt(p, edit ? c.indicativo : '+57')).join('')}</select>
        <input name="numero" placeholder="Número" inputmode="tel" value="${edit ? esc(c.numero) : ''}">
      </div>
      <label class="campo">Categoría</label>
      <select name="categoria">${opt('', '— Sin categoría —')}${state.catContactos.map(x => opt(x, edit ? c.categoria : '')).join('')}</select>
      <label class="campo">Descripción / ¿Para qué es?</label>
      <textarea name="descripcion" rows="2" placeholder="Ej: Transporte escolar">${edit ? esc(c.descripcion) : ''}</textarea>
      <div class="fila" style="margin-top:14px">
        <button class="btn" type="submit">${edit ? 'Guardar' : 'Crear'}</button>
        ${edit ? `<button class="btn danger" type="button" data-delcon="${esc(c.id)}">Eliminar</button>` : ''}
        <button class="btn sec" type="button" data-cerrarmodal="1">Cancelar</button>
      </div>
    </form>`);
}

function modalImportar() {
  abrirModal('Importar productos', `
    <form data-form="importar">
      <p class="ayuda">Pega las filas copiadas de Excel o Google Sheets.<br>
      Orden de columnas: <b>Nombre, Categoría, Ubicación, Descripción</b> (una fila por producto).<br>
      Sirve tabulación, punto y coma o coma. Los que ya existan (mismo nombre) se saltan.</p>
      <textarea name="texto" rows="10" placeholder="Arroz,Despensa y condimentos,Despensa,Arroz Diana 500g&#10;Leche,Lacteos,Nevera,"></textarea>
      <div class="fila" style="margin-top:14px">
        <button class="btn" type="submit">Importar</button>
        <button class="btn sec" type="button" data-cerrarmodal="1">Cancelar</button>
      </div>
    </form>`);
}
function modalSinExistencia(nombre, modo, id) {
  state._pendiente = nombre;
  state._modo = modo || 'cambio';
  state._pendienteId = id || null;
  abrirModal('Sin existencia', `
    <p class="ayuda">¿Llevar "<b>${esc(nombre)}</b>" a la lista de mercado?</p>
    <label class="campo">¿Algo a tener en cuenta para la compra? (opcional)</label>
    <input id="notaCompra" placeholder="Ej: marca, tamaño, dónde comprarlo" autocomplete="off">
    <div class="fila" style="margin-top:16px">
      <button class="btn" data-preguntasi="1">Sí, a la lista</button>
      <button class="btn sec" data-nolista="1">No</button>
    </div>`);
  setTimeout(() => { const el = document.getElementById('notaCompra'); if (el) el.focus(); }, 60);
}

function limpiarPendiente() { state._pendiente = null; state._modo = null; state._pendienteId = null; }
function tomarPendiente() { const r = { nombre: state._pendiente, modo: state._modo, id: state._pendienteId }; limpiarPendiente(); return r; }
function aplicarNoDisponible(id) {
  const p = state.productos.find(x => String(x.id) === String(id));
  if (p) marcarDisponible(p, false);
}

/* ================= EVENTOS ================= */
function onClick(e) {
  const t = e.target.closest('[data-cerrarmodal],[data-ir],[data-logout],[data-guardartoken],[data-probar],[data-nuevoprod],[data-importar],[data-editprod],[data-disp],[data-alista],[data-delprod],[data-togglefiltros],[data-limpiafiltros],[data-togglalista],[data-dellista],[data-limpiarlista],[data-nuevocontacto],[data-editcon],[data-delcon],[data-opadd],[data-oprename],[data-opdel],[data-preguntasi],[data-nolista]');
  if (!t) return;

  if (t.dataset.cerrarmodal !== undefined) { limpiarPendiente(); return cerrarModal(); }
  if (t.dataset.preguntasi !== undefined) {
    const el = document.getElementById('notaCompra');
    const nota = el ? el.value.trim() : '';
    const pend = tomarPendiente();
    cerrarModal();
    if (pend.modo === 'cambio') aplicarNoDisponible(pend.id);
    if (pend.nombre) agregarALista(pend.nombre, nota);
    return;
  }
  if (t.dataset.nolista !== undefined) {
    const pend = tomarPendiente();
    cerrarModal();
    if (pend.modo === 'cambio') aplicarNoDisponible(pend.id);
    return;
  }
  if (t.dataset.ir) { if (t.dataset.ir === 'login') { cfg.cerrarSesion(); state.usuario = null; } return irA(t.dataset.ir); }
  if (t.dataset.logout !== undefined) { encolar('logout', {}); cfg.cerrarSesion(); state.usuario = null; toast('Sesión cerrada'); return irA('login'); }
  if (t.dataset.guardartoken !== undefined) { cfg.guardarToken($('#inToken').value.trim()); toast('Token guardado', 'ok'); return; }
  if (t.dataset.probar !== undefined) { cfg.guardarToken($('#inToken').value.trim()); encolar('init', {}).then(r => { if (r.ok) toast('Conexión OK, hojas listas', 'ok'); }); return; }

  if (t.dataset.nuevoprod !== undefined) return modalProducto(null);
  if (t.dataset.importar !== undefined) return modalImportar();
  if (t.dataset.editprod !== undefined) { const p = state.productos.find(x => String(x.id) === String(t.dataset.editprod)); if (p) modalProducto(p); return; }
  if (t.dataset.disp !== undefined) return cambiarDisponible(t.dataset.disp);
  if (t.dataset.alista !== undefined) {
    const p = state.productos.find(x => String(x.id) === String(t.dataset.alista));
    if (p) modalSinExistencia(p.nombre, 'lista', p.id);
    return;
  }
  if (t.dataset.delprod !== undefined) return eliminarProducto(t.dataset.delprod);

  if (t.dataset.togglefiltros !== undefined) { if (t.dataset.togglefiltros === 'prod') state.filtrosProd = !state.filtrosProd; else state.filtrosCon = !state.filtrosCon; return render(); }
  if (t.dataset.limpiafiltros !== undefined) { if (t.dataset.limpiafiltros === 'prod') state.fProd = { q: '', categoria: '', ubicacion: '' }; else state.fCon = { q: '', categoria: '' }; return render(); }

  if (t.dataset.togglalista !== undefined) return togglearLista(t.dataset.togglalista);
  if (t.dataset.dellista !== undefined) return eliminarDeLista(t.dataset.dellista);
  if (t.dataset.limpiarlista !== undefined) return limpiarLista();

  if (t.dataset.nuevocontacto !== undefined) return modalContacto(null);
  if (t.dataset.editcon !== undefined) { const c = state.contactos.find(x => String(x.id) === String(t.dataset.editcon)); if (c) modalContacto(c); return; }
  if (t.dataset.delcon !== undefined) return eliminarContacto(t.dataset.delcon);

  if (t.dataset.opadd !== undefined) return opAdd(t.dataset.opadd);
  if (t.dataset.oprename !== undefined) return opRename(t.dataset.oprename, t.dataset.nombre);
  if (t.dataset.opdel !== undefined) return opDelete(t.dataset.opdel, t.dataset.nombre);
}

function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === 'producto') return guardarProducto(d);
  if (form.dataset.form === 'contacto') return guardarContacto(d);
  if (form.dataset.form === 'importar') return importarProductos(d.texto);
}

function onInput(e) {
  if (e.target.id === 'fq') { state.fProd.q = e.target.value; return render(); }
  if (e.target.id === 'fqC') { state.fCon.q = e.target.value; return render(); }
}
function onChange(e) {
  if (e.target.id === 'fc') { state.fProd.categoria = e.target.value; return render(); }
  if (e.target.id === 'fu') { state.fProd.ubicacion = e.target.value; return render(); }
  if (e.target.id === 'fcC') { state.fCon.categoria = e.target.value; return render(); }
}

/* ================= ACCIONES (optimistas, en cola) ================= */
function cambiarDisponible(id) {
  const p = state.productos.find(x => String(x.id) === String(id));
  if (!p) return;
  if (p.disponible) {
    // Pasará a "No disponible": primero preguntamos (cerrar con la X no cambia nada).
    modalSinExistencia(p.nombre, 'cambio', p.id);
  } else {
    marcarDisponible(p, true);
  }
}

function marcarDisponible(p, valor) {
  const previo = p.disponible;
  if (previo === valor) return;
  p.disponible = valor;
  render();
  encolar('producto.disponible', () => ({ id: p.id, disponible: valor, quien: quien() }))
    .then(res => { if (!res.ok) { p.disponible = previo; render(); } });
}

function guardarProducto(d) {
  if (!d.nombre.trim()) return;
  const edit = d.id;
  const base = { nombre: d.nombre.trim(), categoria: d.categoria, ubicacion: d.ubicacion, descripcion: d.descripcion.trim() };
  cerrarModal();
  if (edit) {
    const p = state.productos.find(x => String(x.id) === String(edit));
    if (p) Object.assign(p, base);
    render();
    encolar('producto.update', () => Object.assign({ id: edit }, base));
  } else {
    const tmp = 'tmp-' + Date.now();
    const nuevo = Object.assign({ id: tmp, disponible: true }, base);
    state.productos.push(nuevo); render();
    encolar('producto.add', () => Object.assign({}, base, { quien: quien() }))
      .then(res => { if (res.ok && res.r && res.r.id) nuevo.id = res.r.id; });
  }
}

function parseImportacion(texto) {
  const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lineas.length) return [];
  const delim = lineas[0].includes('\t') ? '\t' : (lineas[0].includes(';') ? ';' : ',');
  const out = [];
  lineas.forEach((l, idx) => {
    const c = l.split(delim).map(x => x.trim().replace(/^"|"$/g, ''));
    if (idx === 0 && /^nombre$/i.test(c[0])) return; // encabezado
    out.push({ nombre: c[0] || '', categoria: c[1] || '', ubicacion: c[2] || '', descripcion: c[3] || '' });
  });
  return out;
}

function importarProductos(texto) {
  const items = parseImportacion(texto);
  cerrarModal();
  if (!items.length) { toast('No hay filas para importar', 'error'); return; }
  document.body.classList.add('guardando');
  encolar('producto.import', () => ({ items })).then(res => {
    document.body.classList.remove('guardando');
    if (res.ok && res.r) {
      const r = res.r;
      toast('Importados: ' + r.agregados + ' · ya existían: ' + r.repetidos + (r.invalidos ? ' · sin nombre: ' + r.invalidos : ''), 'ok');
      cargar(true);
    }
  });
}

function eliminarProducto(id) {  state.productos = state.productos.filter(x => String(x.id) !== String(id));
  cerrarModal(); render();
  encolar('producto.delete', () => ({ id }));
}

function agregarALista(nombre, nota) {
  nota = (nota || '').trim();
  const existente = state.lista.find(i => i.estado !== 'comprado' && igualProd(i.producto, nombre));
  if (existente) {
    if (nota) existente.nota = nota;
    render();
    encolar('lista.add', () => ({ producto: nombre, quien: quien(), nota: nota }));
    return;
  }
  const tmp = 'tmp-' + Date.now();
  const item = { id: tmp, producto: nombre, estado: 'pendiente', quien: quien(), nota: nota };
  state.lista.push(item);
  if (state.vista === 'lista') render(); else guardarCache();
  encolar('lista.add', () => ({ producto: nombre, quien: quien(), nota: nota }))
    .then(res => { if (res.ok && res.r && res.r.id) item.id = res.r.id; });
}

function togglearLista(id) {
  const i = state.lista.find(x => String(x.id) === String(id));
  if (!i) return;
  i.estado = i.estado === 'comprado' ? 'pendiente' : 'comprado';
  if (i.estado === 'comprado') {
    const p = state.productos.find(x => igualProd(x.nombre, i.producto));
    if (p) p.disponible = true;
  }
  render();
  encolar('lista.toggle', () => ({ id: i.id, quien: quien() }))
    .then(res => { if (!res.ok) { i.estado = i.estado === 'comprado' ? 'pendiente' : 'comprado'; render(); } });
}

function eliminarDeLista(id) {
  state.lista = state.lista.filter(x => String(x.id) !== String(id)); render();
  encolar('lista.delete', () => ({ id }));
}

function limpiarLista() {
  // Marca como disponibles los productos comprados y saca los comprados de la lista.
  state.lista.filter(i => i.estado === 'comprado').forEach(i => {
    const p = state.productos.find(x => igualProd(x.nombre, i.producto));
    if (p) p.disponible = true;
  });
  state.lista = state.lista.filter(i => i.estado !== 'comprado');
  render();
  encolar('lista.limpiar', () => ({}));
}

function guardarContacto(d) {
  if (!d.nombre.trim()) return;
  const edit = d.id;
  const base = { nombre: d.nombre.trim(), indicativo: d.indicativo, numero: d.numero.trim(), categoria: d.categoria, descripcion: d.descripcion.trim() };
  cerrarModal();
  if (edit) {
    const c = state.contactos.find(x => String(x.id) === String(edit));
    if (c) Object.assign(c, base);
    render();
    encolar('contacto.update', () => Object.assign({ id: edit }, base));
  } else {
    const tmp = 'tmp-' + Date.now();
    const nuevo = Object.assign({ id: tmp }, base);
    state.contactos.push(nuevo); render();
    encolar('contacto.add', () => Object.assign({}, base, { quien: quien() }))
      .then(res => { if (res.ok && res.r && res.r.id) nuevo.id = res.r.id; });
  }
}

function eliminarContacto(id) {
  state.contactos = state.contactos.filter(x => String(x.id) !== String(id));
  cerrarModal(); render();
  encolar('contacto.delete', () => ({ id }));
}

/* ---------- Listas editables (Ajustes) ---------- */
function listaDe(tipo) { return tipo === 'categorias' ? state.categorias : tipo === 'ubicaciones' ? state.ubicaciones : state.catContactos; }
function setLista(tipo, arr) { if (tipo === 'categorias') state.categorias = arr; else if (tipo === 'ubicaciones') state.ubicaciones = arr; else state.catContactos = arr; }

function opAdd(tipo) {
  const el = document.getElementById('nuevo-' + tipo);
  const nombre = (el ? el.value : '').trim();
  if (!nombre) return;
  if (listaDe(tipo).some(x => x.toLowerCase() === nombre.toLowerCase())) { toast('Ya existe'); return; }
  setLista(tipo, listaDe(tipo).concat(nombre).sort((a, b) => a.localeCompare(b))); render();
  encolar('opcion.add', () => ({ tipo, nombre }));
}

function opRename(tipo, nombre) {
  const nuevo = prompt('Nuevo nombre:', nombre);
  if (!nuevo || !nuevo.trim() || nuevo.trim() === nombre) return;
  setLista(tipo, listaDe(tipo).map(x => x === nombre ? nuevo.trim() : x)); render();
  encolar('opcion.rename', () => ({ tipo, nombre, nuevo: nuevo.trim() }));
}

function opDelete(tipo, nombre) {
  encolar('opcion.delete', () => ({ tipo, nombre })).then(res => {
    if (res.ok) { setLista(tipo, listaDe(tipo).filter(x => x !== nombre)); render(); }
  });
}

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.addEventListener('DOMContentLoaded', init);
