// ===== Mi Casa — app.js (v3 · módulos) =====

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
const normalizarLista = i => ({ id: i.id, producto: i.producto || '', estado: i.estado === 'comprado' ? 'comprado' : 'pendiente', quien: i.quien || '' });

const PAISES = ['+57', '+1', '+52', '+54', '+56', '+51', '+58', '+593', '+591', '+595', '+598', '+507', '+506', '+502', '+503', '+504', '+505', '+53', '+1809', '+34'];

let toastTimer;
function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ver ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ---------- Arranque ---------- */
function init() {
  $('#btnSync').addEventListener('click', () => cargar());
  $$('.tab').forEach(t => t.addEventListener('click', () => irA(t.dataset.vista)));
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);

  if (!cfg.api) { toast('Falta configurar la API', 'error'); return; }
  if (!cfg.session && !cfg.token) { irA('login'); }
  else { irA('despensa'); cargar(); }
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
  if (foco && foco.id) { const el = document.getElementById(foco.id); if (el) { el.focus(); try { el.setSelectionRange(foco.pos, foco.pos); } catch (e) {} } }
}

/* ---------- Datos ---------- */
async function cargar() {
  if (!cfg.session && !cfg.token) { irA('login'); return; }
  try {
    const r = await apiGet('getAll');
    if (r && r.codigo === 'AUTH') { cfg.cerrarSesion(); state.usuario = null; return irA('login'); }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Respuesta inválida');
    state.productos = (r.productos || []).map(normalizarProducto);
    state.lista = (r.lista || []).map(normalizarLista);
    state.contactos = (r.contactos || []).map(normalizarContacto);
    state.categorias = (r.categorias || []).map(c => c.nombre).filter(Boolean);
    state.ubicaciones = (r.ubicaciones || []).map(c => c.nombre).filter(Boolean);
    state.catContactos = (r.catContactos || []).map(c => c.nombre).filter(Boolean);
    state.usuario = r.usuario || { nombre: cfg.nombre, email: cfg.email };
  } catch (e) { toast('No se pudo conectar: ' + e.message, 'error'); }
  render();
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
        ${p.descripcion ? `<div class="prod-desc">${esc(p.descripcion)}</div>` : ''}
      </div>
      <button class="estado ${p.disponible ? 'ok' : 'no'}" data-disp="${esc(p.id)}">${p.disponible ? 'Disponible' : 'No disponible'}</button>
    </div>`;

  return `
    <div class="mod-head">
      <h2>Despensa <span class="cont">${items.length}</span></h2>
      <div class="mod-acciones">
        <button class="btn sec mini ${state.filtrosProd ? 'on' : ''}" data-togglefiltros="prod">Filtros${activos ? ' (' + activos + ')' : ''}</button>
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
function vistaLista() {
  const pend = state.lista.filter(i => i.estado !== 'comprado');
  const comp = state.lista.filter(i => i.estado === 'comprado');
  const item = i => `
    <div class="item ${i.estado === 'comprado' ? 'comprado' : ''}">
      <button class="check ${i.estado === 'comprado' ? 'on' : ''}" data-togglalista="${esc(i.id)}">${i.estado === 'comprado' ? '✓' : ''}</button>
      <div class="info">
        <div class="nombre">${esc(i.producto)}</div>
        ${i.quien ? `<div class="meta">${esc(i.quien)}</div>` : ''}
      </div>
      <button class="btn sec mini" data-dellista="${esc(i.id)}">✕</button>
    </div>`;

  return `
    <div class="mod-head"><h2>Lista de mercado <span class="cont">${pend.length}</span></h2></div>
    <div class="card">
      <h2>Por comprar</h2>
      ${pend.length ? pend.map(item).join('') : '<p class="vacio">Nada pendiente.</p>'}
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
        ${c.descripcion ? `<div class="prod-desc">${esc(c.descripcion)}</div>` : ''}
      </div>
      ${c.numero ? `<a class="btn mini" href="tel:${esc(tel(c).replace(/\s/g, ''))}" data-nollenar>📞 ${esc(tel(c))}</a>` : ''}
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

function modalPregunta(titulo, texto, si, onSi) {
  abrirModal(titulo, `<p class="ayuda">${esc(texto)}</p>
    <div class="fila" style="margin-top:16px">
      <button class="btn" data-preguntasi="1">${esc(si)}</button>
      <button class="btn sec" data-cerrarmodal="1">No</button>
    </div>`);
  state._onSi = onSi;
}

/* ================= EVENTOS ================= */
function onClick(e) {
  const t = e.target.closest('[data-cerrarmodal],[data-ir],[data-logout],[data-guardartoken],[data-probar],[data-nuevoprod],[data-editprod],[data-disp],[data-delprod],[data-togglefiltros],[data-limpiafiltros],[data-togglalista],[data-dellista],[data-limpiarlista],[data-nuevocontacto],[data-editcon],[data-delcon],[data-opadd],[data-oprename],[data-opdel],[data-preguntasi]');
  if (!t) return;

  if (t.dataset.cerrarmodal !== undefined) { state._onSi = null; return cerrarModal(); }
  if (t.dataset.preguntasi !== undefined) { const fn = state._onSi; state._onSi = null; cerrarModal(); if (fn) fn(); return; }
  if (t.dataset.ir) { if (t.dataset.ir === 'login') { cfg.cerrarSesion(); state.usuario = null; } return irA(t.dataset.ir); }
  if (t.dataset.logout !== undefined) { apiPost('logout').catch(() => {}); cfg.cerrarSesion(); state.usuario = null; toast('Sesión cerrada'); return irA('login'); }
  if (t.dataset.guardartoken !== undefined) { cfg.guardarToken($('#inToken').value.trim()); toast('Token guardado', 'ok'); return; }
  if (t.dataset.probar !== undefined) {
    cfg.guardarToken($('#inToken').value.trim());
    apiPost('init').then(r => { if (!r.ok) throw new Error(r.error); toast('Conexión OK, hojas listas', 'ok'); });
    return;
  }

  if (t.dataset.nuevoprod !== undefined) return modalProducto(null);
  if (t.dataset.editprod !== undefined) { const p = state.productos.find(x => String(x.id) === String(t.dataset.editprod)); if (p) modalProducto(p); return; }
  if (t.dataset.disp !== undefined) return cambiarDisponible(t.dataset.disp);
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

/* ================= ACCIONES (optimistas) ================= */
async function sincronizar(action, data) {
  try {
    const r = await apiPost(action, data);
    if (r && r.codigo === 'AUTH') { cfg.cerrarSesion(); state.usuario = null; irA('login'); return null; }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Error');
    return r;
  } catch (err) { toast(err.message, 'error'); cargar(); return null; }
}

async function guardarProducto(d) {
  if (!d.nombre.trim()) return;
  const edit = d.id;
  cerrarModal();
  if (edit) {
    const p = state.productos.find(x => String(x.id) === String(edit));
    if (p) { Object.assign(p, { nombre: d.nombre.trim(), categoria: d.categoria, ubicacion: d.ubicacion, descripcion: d.descripcion.trim() }); render(); }
    await sincronizar('producto.update', { id: edit, nombre: d.nombre.trim(), categoria: d.categoria, ubicacion: d.ubicacion, descripcion: d.descripcion.trim() });
  } else {
    const tmp = 'tmp-' + Date.now();
    state.productos.push({ id: tmp, nombre: d.nombre.trim(), categoria: d.categoria, ubicacion: d.ubicacion, descripcion: d.descripcion.trim(), disponible: true });
    render();
    const r = await sincronizar('producto.add', { nombre: d.nombre.trim(), categoria: d.categoria, ubicacion: d.ubicacion, descripcion: d.descripcion.trim(), quien: quien() });
    if (r && r.id) { const p = state.productos.find(x => x.id === tmp); if (p) p.id = r.id; }
  }
}

async function cambiarDisponible(id) {
  const p = state.productos.find(x => String(x.id) === String(id));
  if (!p) return;
  const previo = p.disponible;
  p.disponible = !previo; render();
  const r = await sincronizar('producto.disponible', { id, disponible: p.disponible, quien: quien() });
  if (!r) return;
  if (!p.disponible) {
    modalPregunta('Sin existencia', '¿Llevar "' + p.nombre + '" a la lista de mercado?', 'Sí, a la lista', () => agregarALista(p.nombre));
  }
}

async function eliminarProducto(id) {
  await sincronizar('producto.delete', { id });
  state.productos = state.productos.filter(x => String(x.id) !== String(id));
  cerrarModal(); render();
}

async function agregarALista(nombre) {
  if (state.lista.some(i => i.estado !== 'comprado' && i.producto.toLowerCase() === nombre.toLowerCase())) { toast('Ya está en la lista'); return; }
  const tmp = 'tmp-' + Date.now();
  state.lista.push({ id: tmp, producto: nombre, estado: 'pendiente', quien: quien() });
  if (state.vista === 'lista') render();
  const r = await sincronizar('lista.add', { producto: nombre, quien: quien() });
  if (r && r.id) { const i = state.lista.find(x => x.id === tmp); if (i) i.id = r.id; }
}

async function togglearLista(id) {
  const i = state.lista.find(x => String(x.id) === String(id));
  if (!i) return;
  const previo = i.estado;
  i.estado = previo === 'comprado' ? 'pendiente' : 'comprado'; render();
  await sincronizar('lista.toggle', { id, quien: quien() });
}

async function eliminarDeLista(id) {
  state.lista = state.lista.filter(x => String(x.id) !== String(id)); render();
  await sincronizar('lista.delete', { id });
}

async function limpiarLista() {
  state.lista = state.lista.filter(i => i.estado !== 'comprado'); render();
  await sincronizar('lista.limpiar', {});
}

async function guardarContacto(d) {
  if (!d.nombre.trim()) return;
  const edit = d.id;
  const base = { nombre: d.nombre.trim(), indicativo: d.indicativo, numero: d.numero.trim(), categoria: d.categoria, descripcion: d.descripcion.trim() };
  cerrarModal();
  if (edit) {
    const c = state.contactos.find(x => String(x.id) === String(edit));
    if (c) { Object.assign(c, base); render(); }
    await sincronizar('contacto.update', Object.assign({ id: edit }, base));
  } else {
    const tmp = 'tmp-' + Date.now();
    state.contactos.push(Object.assign({ id: tmp }, base)); render();
    const r = await sincronizar('contacto.add', Object.assign({}, base, { quien: quien() }));
    if (r && r.id) { const c = state.contactos.find(x => x.id === tmp); if (c) c.id = r.id; }
  }
}

async function eliminarContacto(id) {
  state.contactos = state.contactos.filter(x => String(x.id) !== String(id));
  cerrarModal(); render();
  await sincronizar('contacto.delete', { id });
}

/* ---------- Listas editables (Ajustes) ---------- */
function listaDe(tipo) { return tipo === 'categorias' ? state.categorias : tipo === 'ubicaciones' ? state.ubicaciones : state.catContactos; }
function setLista(tipo, arr) { if (tipo === 'categorias') state.categorias = arr; else if (tipo === 'ubicaciones') state.ubicaciones = arr; else state.catContactos = arr; }

async function opAdd(tipo) {
  const el = document.getElementById('nuevo-' + tipo);
  const nombre = (el ? el.value : '').trim();
  if (!nombre) return;
  if (listaDe(tipo).some(x => x.toLowerCase() === nombre.toLowerCase())) { toast('Ya existe'); return; }
  setLista(tipo, listaDe(tipo).concat(nombre).sort((a, b) => a.localeCompare(b))); render();
  await sincronizar('opcion.add', { tipo, nombre });
}

async function opRename(tipo, nombre) {
  const nuevo = prompt('Nuevo nombre:', nombre);
  if (!nuevo || !nuevo.trim() || nuevo.trim() === nombre) return;
  setLista(tipo, listaDe(tipo).map(x => x === nombre ? nuevo.trim() : x)); render();
  await sincronizar('opcion.rename', { tipo, nombre, nuevo: nuevo.trim() });
}

async function opDelete(tipo, nombre) {
  const r = await sincronizar('opcion.delete', { tipo, nombre });
  if (!r) return;
  setLista(tipo, listaDe(tipo).filter(x => x !== nombre)); render();
}

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.addEventListener('DOMContentLoaded', init);
