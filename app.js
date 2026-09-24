// ===== Mercado Casa — lógica de la app =====
// Este archivo habla con tu API de Google Apps Script (definida en Code.gs).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  vista: 'lista',
  productos: [],
  lista: [],
  filtro: '',
  cargando: false
};

/* ---------- Configuración (URL de la API + token) ---------- */
const cfg = {
  get api() {
    return localStorage.getItem('mc_api') ||
      (window.MERCADO_CONFIG && window.MERCADO_CONFIG.API_URL) || '';
  },
  get token() {
    return localStorage.getItem('mc_token') ||
      (window.MERCADO_CONFIG && window.MERCADO_CONFIG.TOKEN) || '';
  },
  guardar(api, token) {
    localStorage.setItem('mc_api', api.trim());
    localStorage.setItem('mc_token', token.trim());
  },
  lista() {
    return !!this.api && !!this.token;
  }
};

/* ---------- Llamadas a la API ---------- */
// GET: la URL de Apps Script redirige a googleusercontent.com, que sí permite CORS.
async function apiGet(action) {
  const url = cfg.api + '?action=' + encodeURIComponent(action) +
    '&token=' + encodeURIComponent(cfg.token) + '&_=' + Date.now();
  const res = await fetch(url);
  return res.json();
}

// POST con Content-Type "text/plain" para evitar el "preflight" que Apps Script no maneja.
async function apiPost(action, data) {
  const res = await fetch(cfg.api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: cfg.token, data: data || {} })
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
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function quien() {
  let q = localStorage.getItem('mc_quien');
  if (!q) { q = prompt('¿Tu nombre? (para saber quién agregó cada cosa)', '') || ''; localStorage.setItem('mc_quien', q); }
  return q;
}

/* ---------- Arranque ---------- */
function init() {
  $('#btnSync').addEventListener('click', () => cargar());
  $$('.tab').forEach(t => t.addEventListener('click', () => irA(t.dataset.vista)));
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);

  irA(cfg.lista() ? 'lista' : 'ajustes');
  if (cfg.lista()) cargar();
}

function irA(vista) {
  state.vista = vista;
  $$('.tab').forEach(t => t.classList.toggle('activo', t.dataset.vista === vista));
  render();
}

async function cargar() {
  if (!cfg.lista()) { irA('ajustes'); return; }
  state.cargando = true; render();
  try {
    const r = await apiGet('getAll');
    if (!r || !r.ok) throw new Error((r && r.error) || 'Respuesta inválida');
    state.productos = r.productos || [];
    state.lista = r.lista || [];
  } catch (e) {
    toast('No se pudo conectar: ' + e.message, 'error');
  }
  state.cargando = false; render();
}

/* ---------- Render ---------- */
function render() {
  const v = $('#vista');
  if (state.vista === 'ajustes') { v.innerHTML = vistaAjustes(); return; }
  if (!cfg.lista()) { irA('ajustes'); return; }
  v.innerHTML = state.vista === 'lista' ? vistaLista() : vistaDespensa();
}

/* ----- Vista: Lista de mercado ----- */
function vistaLista() {
  const pend = state.lista.filter(i => i.estado !== 'comprado');
  const comp = state.lista.filter(i => i.estado === 'comprado');

  const itemLi = (i) => `
    <div class="item ${i.estado === 'comprado' ? 'comprado' : ''}">
      <button class="check ${i.estado === 'comprado' ? 'on' : ''}" data-toggle="${esc(i.id)}"
        title="${i.estado === 'comprado' ? 'Devolver a pendientes' : 'Marcar comprado'}">
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
        <div class="fila" style="margin-top:8px">
          <button class="btn" type="submit">+ Agregar</button>
        </div>
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
      <div style="margin-top:12px">
        <button class="btn sec" data-limpiar="1">Limpiar comprados</button>
      </div>
    </div>` : ''}
  `;
}

/* ----- Vista: Despensa ----- */
function vistaDespensa() {
  const f = state.filtro.trim().toLowerCase();
  let prods = state.productos
    .filter(p => String(p.activo).toLowerCase() !== 'false')
    .filter(p => !f || String(p.nombre).toLowerCase().includes(f) ||
                 String(p.categoria).toLowerCase().includes(f));

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
  return `
    <div class="card">
      <h2>Conexión</h2>
      <p class="ayuda">Pega la URL de tu implementación de Apps Script y el token que definiste en <code>Code.gs</code>.</p>
      <label class="campo">URL de la API (termina en /exec)</label>
      <input id="inApi" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(cfg.api)}">
      <label class="campo">Token secreto</label>
      <input id="inToken" placeholder="mercado-casa-2026" value="${esc(cfg.token)}">
      <label class="campo">Tu nombre (para saber quién agregó cada cosa)</label>
      <input id="inQuien" placeholder="Ej: Luis" value="${esc(localStorage.getItem('mc_quien') || '')}">
      <div class="fila" style="margin-top:14px">
        <button class="btn" data-guardar="1">Guardar</button>
        <button class="btn sec" data-probar="1">Probar y crear hojas</button>
      </div>
    </div>
    <div class="card">
      <h2>Cómo funciona</h2>
      <p class="ayuda">
        Los datos viven en una <b>Hoja de Google</b> en tu Drive (pestañas: productos, lista, movimientos).
        Esta web solo los lee y escribe. Comparte la URL de Vercel con tu familia: todos ven lo mismo.
      </p>
    </div>`;
}

/* ---------- Acciones (delegadas) ---------- */
async function onClick(e) {
  const t = e.target.closest('[data-toggle],[data-del],[data-limpiar],[data-stock],[data-alista],[data-delprod],[data-guardar],[data-probar]');
  if (!t) return;

  // Ajustes
  if (t.dataset.guardar !== undefined) {
    cfg.guardar($('#inApi').value, $('#inToken').value);
    localStorage.setItem('mc_quien', $('#inQuien').value.trim());
    toast('Guardado', 'ok');
    irA('lista'); cargar();
    return;
  }
  if (t.dataset.probar !== undefined) {
    cfg.guardar($('#inApi').value, $('#inToken').value);
    localStorage.setItem('mc_quien', $('#inQuien').value.trim());
    try {
      const r = await apiPost('init');
      if (!r.ok) throw new Error(r.error || 'Error');
      toast('Conexión OK, hojas listas', 'ok');
      irA('lista'); cargar();
    } catch (err) { toast('Falló: ' + err.message, 'error'); }
    return;
  }

  // Lista
  if (t.dataset.toggle) return mutar('lista.toggle', { id: t.dataset.toggle, quien: quien() });
  if (t.dataset.del)    return mutar('lista.delete', { id: t.dataset.del });
  if (t.dataset.limpiar !== undefined) return mutar('lista.limpiar', {});

  // Despensa
  if (t.dataset.stock) {
    return mutar('producto.stock', { id: t.dataset.stock, delta: num(t.dataset.delta), quien: quien() });
  }
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

// Envía una mutación, recarga y refresca la vista.
async function mutar(action, data) {
  if (!cfg.lista()) { irA('ajustes'); return; }
  try {
    const r = await apiPost(action, data);
    if (!r || !r.ok) throw new Error((r && r.error) || 'Error');
    await cargar();
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------- Filtro en vivo (despensa) ---------- */
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
