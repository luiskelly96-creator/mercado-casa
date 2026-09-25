// ===== Mercado Casa — lógica de la app (v2 · Login Google) =====

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  vista: 'lista',
  usuario: null,
  productos: [],
  lista: [],
  filtro: '',
  cargando: false
};

/* ---------- Configuración ---------- */
const cfg = {
  get api() { return (window.MERCADO_CONFIG && window.MERCADO_CONFIG.API_URL) || ''; },
  get clientId() { return (window.MERCADO_CONFIG && window.MERCADO_CONFIG.CLIENT_ID) || ''; },
  get session() { return localStorage.getItem('mc_session') || ''; },
  get nombre() { return localStorage.getItem('mc_nombre') || ''; },
  get email() { return localStorage.getItem('mc_email') || ''; },
  get token() { return localStorage.getItem('mc_token') || ''; },
  iniciarSesion(session, email, nombre) {
    localStorage.setItem('mc_session', session);
    localStorage.setItem('mc_email', email || '');
    localStorage.setItem('mc_nombre', nombre || '');
  },
  cerrarSesion() {
    ['mc_session', 'mc_email', 'mc_nombre'].forEach(k => localStorage.removeItem(k));
  },
  guardarToken(t) { localStorage.setItem('mc_token', t || ''); }
};

/* ---------- API ---------- */
async function apiGet(action) {
  const url = cfg.api + '?action=' + encodeURIComponent(action) +
    '&session=' + encodeURIComponent(cfg.session) +
    '&token=' + encodeURIComponent(cfg.token) + '&_=' + Date.now();
  const res = await fetch(url);
  return res.json();
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
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const hoyTexto = () => new Date().toLocaleDateString('es', { day: '2-digit', month: 'short' });

let toastTimer;
function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ver ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

const quien = () => state.usuario ? (state.usuario.nombre || state.usuario.email) : '';

/* ---------- Arranque ---------- */
function init() {
  $('#btnSync').addEventListener('click', () => cargar());
  $$('.tab').forEach(t => t.addEventListener('click', () => irA(t.dataset.vista)));
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);

  if (!cfg.api) { toast('Falta configurar la URL de la API', 'error'); return; }

  if (!cfg.session && !cfg.token) {
    irA('login');
  } else {
    irA('lista');
    cargar();
  }
}

function irA(vista) {
  state.vista = vista;
  const logueado = !!state.usuario || !!cfg.session || !!cfg.token;
  $$('.tab').forEach(t => {
    t.style.display = (vista === 'login' && t.dataset.vista === 'ajustes') ? 'flex' : '';
    t.classList.toggle('activo', t.dataset.vista === vista);
  });
  render();
}

/* ---------- Carga de datos ---------- */
async function cargar() {
  if (!cfg.session && !cfg.token) { irA('login'); return; }
  state.cargando = true; render();
  try {
    const r = await apiGet('getAll');
    if (r && r.codigo === 'AUTH') {
      cfg.cerrarSesion();
      toast('Tu sesión expiró, vuelve a entrar', 'error');
      state.usuario = null; irA('login'); return;
    }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Respuesta inválida');
    state.productos = r.productos || [];
    state.lista = r.lista || [];
    state.usuario = r.usuario || { nombre: cfg.nombre, email: cfg.email };
  } catch (e) {
    toast('No se pudo conectar: ' + e.message, 'error');
  }
  state.cargando = false; render();
}

/* ---------- Render ---------- */
function render() {
  const v = $('#vista');
  if (state.vista === 'login') { v.innerHTML = vistaLogin(); initGSI(); return; }
  if (!state.usuario && !cfg.session && !cfg.token) { state.vista = 'login'; v.innerHTML = vistaLogin(); initGSI(); return; }
  if (state.vista === 'ajustes') { v.innerHTML = vistaAjustes(); return; }
  v.innerHTML = state.vista === 'lista' ? vistaLista() : vistaDespensa();
}

/* ----- Vista: Login ----- */
function vistaLogin() {
  const listo = cfg.clientId && cfg.clientId.indexOf('PENDIENTE') !== 0;
  return `
    <div class="card" style="text-align:center">
      <div style="font-size:2.6rem">🛒</div>
      <h2 style="margin-top:6px">Mercado Casa</h2>
      <p class="ayuda">Entra con tu cuenta de Google autorizada para ver y editar la lista de la familia.</p>
      <div id="gbtn" style="display:flex;justify-content:center;margin-top:14px"></div>
      ${listo ? '' : '<p class="ayuda" style="color:#b45309;margin-top:12px">Falta configurar el CLIENT_ID de Google en config.js</p>'}
    </div>
    <div class="card">
      <h2>¿No puedes entrar?</h2>
      <p class="ayuda">Tu correo debe estar autorizado en la pestaña <b>usuarios</b> de la Hoja de Google.
      Pídele al dueño que agregue tu correo y vuelve a intentar.</p>
      <button class="btn sec" data-ir="ajustes" style="margin-top:10px">Opciones avanzadas</button>
    </div>`;
}

let gsiInited = false;
function initGSI() {
  if (!cfg.clientId || cfg.clientId.indexOf('PENDIENTE') === 0) return;
  if (!(window.google && window.google.accounts && window.google.accounts.id)) {
    setTimeout(initGSI, 200); return;
  }
  try {
    if (!gsiInited) {
      google.accounts.id.initialize({ client_id: cfg.clientId, callback: onCredential });
      gsiInited = true;
    }
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
    irA('lista'); cargar();
  } catch (e) { toast(e.message, 'error'); }
}

/* ----- Vista: Lista ----- */
function vistaLista() {
  const pend = state.lista.filter(i => i.estado !== 'comprado');
  const comp = state.lista.filter(i => i.estado === 'comprado');

  const itemLi = (i) => `
    <div class="item ${i.estado === 'comprado' ? 'comprado' : ''}">
      <button class="check ${i.estado === 'comprado' ? 'on' : ''}" data-toggle="${esc(i.id)}">
        ${i.estado === 'comprado' ? '✓' : ''}
      </button>
      <div class="info">
        <div class="nombre">${esc(i.producto)}</div>
        <div class="meta">${num(i.cantidad)} ${esc(i.unidad || '')}${i.quien ? ' · ' + esc(i.quien) : ''}</div>
      </div>
      <button class="btn sec mini" data-del="${esc(i.id)}">✕</button>
    </div>`;

  return `
    <div class="card">
      <h2>Agregar a la lista</h2>
      <form data-form="lista">
        <div class="fila">
          <input name="producto" placeholder="¿Qué falta? (ej: leche)" autocomplete="off" required>
          <input name="cantidad" type="number" value="1" min="0.1" step="any" style="max-width:90px">
          <select name="unidad" style="max-width:100px">
            <option>und</option><option>kg</option><option>g</option><option>lt</option><option>ml</option><option>paq</option>
          </select>
        </div>
        <div class="fila" style="margin-top:8px"><button class="btn" type="submit">+ Agregar</button></div>
      </form>
    </div>

    <div class="card">
      <h2>Por comprar ${pend.length ? '(' + pend.length + ')' : ''}</h2>
      ${pend.length ? pend.map(itemLi).join('') : '<p class="vacio">Nada pendiente. ¡Bien ahí!</p>'}
    </div>

    ${comp.length ? `
    <div class="card">
      <h2>Comprados ${hoyTexto()}</h2>
      ${comp.map(itemLi).join('')}
      <div style="margin-top:12px"><button class="btn sec" data-limpiar="1">Limpiar comprados</button></div>
    </div>` : ''}
  `;
}

/* ----- Vista: Despensa ----- */
function vistaDespensa() {
  const f = state.filtro.trim().toLowerCase();
  let prods = state.productos
    .filter(p => String(p.activo).toLowerCase() !== 'false')
    .filter(p => !f || String(p.nombre).toLowerCase().includes(f) || String(p.categoria).toLowerCase().includes(f));
  prods.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  const fila = (p) => {
    const stock = num(p.stock), min = num(p.stock_minimo);
    const bajo = min > 0 && stock <= min;
    return `
      <div class="item ${bajo ? 'bajo' : ''}">
        <div class="info">
          <div class="nombre">${esc(p.nombre)}</div>
          <div class="meta">${esc(p.categoria || 'Sin categoría')}${p.ubicacion ? ' · ' + esc(p.ubicacion) : ''}${bajo ? '<span class="chip">bajo</span>' : ''}</div>
        </div>
        <div class="stock-ctrl">
          <button data-stock="${esc(p.id)}" data-delta="-1">−</button>
          <span class="stock-num">${stock}</span>
          <button data-stock="${esc(p.id)}" data-delta="1">+</button>
        </div>
        <button class="btn sec mini" data-alista="${esc(p.id)}" title="Agregar a la lista">📝</button>
        <button class="btn sec mini" data-delprod="${esc(p.id)}" title="Eliminar">✕</button>
      </div>`;
  };

  return `
    <div class="card">
      <h2>Buscar</h2>
      <input id="buscar" placeholder="Filtrar por nombre o categoría" value="${esc(state.filtro)}" autocomplete="off">
    </div>

    <div class="card">
      <h2>Nuevo producto</h2>
      <form data-form="producto">
        <div class="fila">
          <input name="nombre" placeholder="Nombre (ej: arroz)" required autocomplete="off">
          <input name="categoria" placeholder="Categoría" list="cats" autocomplete="off" style="max-width:160px">
        </div>
        <datalist id="cats">
          <option>Aseo</option><option>Carnes</option><option>Frutas y verduras</option>
          <option>Granos</option><option>Lácteos</option><option>Bebidas</option>
          <option>Snacks</option><option>Otros</option>
        </datalist>
        <div class="fila" style="margin-top:8px">
          <input name="stock" type="number" value="0" step="any" placeholder="Cantidad" style="max-width:110px">
          <select name="unidad" style="max-width:100px">
            <option>und</option><option>kg</option><option>g</option><option>lt</option><option>ml</option><option>paq</option>
          </select>
          <input name="stock_minimo" type="number" value="0" step="any" placeholder="Mínimo" style="max-width:110px">
          <select name="ubicacion" style="max-width:130px">
            <option value="">Ubicación</option><option>Despensa</option><option>Nevera</option><option>Congelador</option><option>Baño</option>
          </select>
        </div>
        <div class="fila" style="margin-top:8px"><button class="btn" type="submit">+ Guardar producto</button></div>
      </form>
    </div>

    <div class="card">
      <h2>Despensa (${prods.length})</h2>
      ${prods.length ? prods.map(fila).join('') : '<p class="vacio">Sin productos todavía.</p>'}
    </div>
  `;
}

/* ----- Vista: Ajustes ----- */
function vistaAjustes() {
  const sesion = cfg.session || cfg.token;
  return `
    <div class="card">
      <h2>Cuenta</h2>
      ${sesion ? `
        <p class="ayuda">Sesión activa:<br><b>${esc(state.usuario ? (state.usuario.nombre || '') : cfg.nombre)}</b><br>${esc(state.usuario ? state.usuario.email : cfg.email)}</p>
        <button class="btn danger" data-logout="1" style="margin-top:12px">Cerrar sesión</button>
      ` : `
        <p class="ayuda">No has iniciado sesión.</p>
        <button class="btn" data-ir="login" style="margin-top:10px">Iniciar sesión con Google</button>
      `}
    </div>

    <div class="card">
      <h2>Avanzado (dueño)</h2>
      <p class="ayuda">Solo para el administrador. El token permite ejecutar tareas de mantenimiento.</p>
      <label class="campo">Token del dueño</label>
      <input id="inToken" placeholder="token" value="${esc(cfg.token)}">
      <div class="fila" style="margin-top:14px">
        <button class="btn" data-guardartoken="1">Guardar</button>
        <button class="btn sec" data-probar="1">Probar y crear hojas</button>
      </div>
    </div>

    <div class="card">
      <h2>Cómo funciona</h2>
      <p class="ayuda">Los datos viven en una <b>Hoja de Google</b> en tu Drive. Entran solo los correos autorizados
      en la pestaña <b>usuarios</b>. La web no guarda contraseñas: usa tu cuenta de Google.</p>
    </div>`;
}

/* ---------- Acciones ---------- */
async function onClick(e) {
  const t = e.target.closest('[data-toggle],[data-del],[data-limpiar],[data-stock],[data-alista],[data-delprod],[data-guardartoken],[data-probar],[data-logout],[data-ir]');
  if (!t) return;

  if (t.dataset.ir) {
    if (t.dataset.ir === 'login') { cfg.cerrarSesion(); state.usuario = null; }
    return irA(t.dataset.ir);
  }
  if (t.dataset.logout !== undefined) {
    try { await apiPost('logout'); } catch (e2) {}
    cfg.cerrarSesion(); state.usuario = null;
    toast('Sesión cerrada'); return irA('login');
  }
  if (t.dataset.guardartoken !== undefined) {
    cfg.guardarToken($('#inToken').value.trim());
    toast('Token guardado', 'ok'); return irA('lista');
  }
  if (t.dataset.probar !== undefined) {
    cfg.guardarToken($('#inToken').value.trim());
    try {
      const r = await apiPost('init');
      if (!r.ok) throw new Error(r.error || 'Error');
      toast('Conexión OK, hojas listas', 'ok');
      irA('lista'); cargar();
    } catch (err) { toast('Falló: ' + err.message, 'error'); }
    return;
  }

  if (t.dataset.toggle) return mutar('lista.toggle', { id: t.dataset.toggle, quien: quien() });
  if (t.dataset.del)    return mutar('lista.delete', { id: t.dataset.del });
  if (t.dataset.limpiar !== undefined) return mutar('lista.limpiar', {});
  if (t.dataset.stock)  return mutar('producto.stock', { id: t.dataset.stock, delta: num(t.dataset.delta), quien: quien() });
  if (t.dataset.alista) {
    const p = state.productos.find(x => String(x.id) === String(t.dataset.alista));
    if (p) return mutar('lista.add', { producto: p.nombre, cantidad: 1, unidad: p.unidad, quien: quien() });
  }
  if (t.dataset.delprod) {
    if (confirm('¿Eliminar este producto de la despensa?')) return mutar('producto.delete', { id: t.dataset.delprod });
  }
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === 'lista') {
    if (!datos.producto.trim()) return;
    form.reset();
    await mutar('lista.add', { ...datos, quien: quien() });
  } else if (form.dataset.form === 'producto') {
    form.reset();
    await mutar('producto.add', { ...datos, quien: quien() });
  }
}

async function mutar(action, data) {
  if (!cfg.session && !cfg.token) { irA('login'); return; }
  try {
    const r = await apiPost(action, data);
    if (r && r.codigo === 'AUTH') { cfg.cerrarSesion(); state.usuario = null; irA('login'); return; }
    if (!r || !r.ok) throw new Error((r && r.error) || 'Error');
    await cargar();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------- Filtro en vivo ---------- */
document.addEventListener('input', (e) => {
  if (e.target.id === 'buscar') {
    state.filtro = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $('#buscar');
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }
});

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.addEventListener('DOMContentLoaded', init);
