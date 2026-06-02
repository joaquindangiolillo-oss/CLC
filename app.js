'use strict';

// ── Estado inicial ────────────────────────────────────────────────────────────
const STOCK_INICIAL = {
  adultos: {
    S:   { veredaRoja: 5, veredaNegra: 5, reposeraRoja: 4, reposeraNegra: 4, blanca: 10 },
    M:   { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 3, reposeraNegra: 3, blanca: 10 },
    L:   { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 3, reposeraNegra: 3, blanca: 15 },
    XL:  { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 3, reposeraNegra: 3, blanca: 15 },
    XXL: { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 2, reposeraNegra: 2, blanca:  5 },
  },
  totes: { silla: 9, vereda: 5 },
  ninos: { 2: 1, 4: 2, 6: 2, 8: 1, 10: 3, 12: 1, 16: 2 },
};

const VARIANTES      = ['reposeraRoja', 'reposeraNegra', 'blanca', 'veredaRoja', 'veredaNegra'];
const TALLES_ADULTO  = ['S', 'M', 'L', 'XL', 'XXL'];
const TALLES_NINO    = [2, 4, 6, 8, 10, 12, 16];

const PRECIOS = { remera: 25000, tote: 16000, remera_uyu: 650, tote_uyu: 400, nino_uyu: 500 };

const LABEL_VARIANTE = {
  veredaRoja:    'Vereda Roja',
  veredaNegra:   'Vereda Negra',
  reposeraRoja:  'Reposera Roja',
  reposeraNegra: 'Reposera Negra',
  blanca:        'Blanca',
};

const COL_CLASS = {
  veredaRoja:    'col-vr',
  veredaNegra:   'col-vn',
  reposeraRoja:  'col-rr',
  reposeraNegra: 'col-rn',
  blanca:        'col-bl',
};

// Agrupación para la tabla transpuesta (diseño + color separados)
const GRUPOS_ADULTO = [
  { nombre: 'Reposera', variantes: ['reposeraRoja', 'reposeraNegra'] },
  { nombre: 'Blanca',   variantes: ['blanca'] },
  { nombre: 'Vereda',   variantes: ['veredaRoja',   'veredaNegra']   },
];
const COLOR_VARIANTE = {
  reposeraRoja: 'Roja', reposeraNegra: 'Negra',
  blanca: '—',
  veredaRoja: 'Roja',   veredaNegra: 'Negra',
};

// ── Persistencia ──────────────────────────────────────────────────────────────
function cargarEstado() {
  try {
    const raw = localStorage.getItem('cayo_stock');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return JSON.parse(JSON.stringify(STOCK_INICIAL));
}

// Normaliza campos faltantes en entradas viejas del historial
function normalizeHistorial(arr) {
  let changed = false;
  arr.forEach(h => {
    if (!h.id) { h.id = Date.now() + Math.random(); changed = true; }
    if (h.pago === undefined || h.pago === null) { h.pago = 'efectivo'; changed = true; }
    if (h.ingreso === undefined || h.ingreso === null) {
      h.ingreso = h.pago === 'regalo' ? 0 : (h.precioUnit ?? 0) * (h.cantidad ?? 1);
      changed = true;
    }
    if (h.precioUnit === undefined || h.precioUnit === null) {
      h.precioUnit = h.descripcion?.startsWith('Tote') ? 16000 : 25000;
      changed = true;
    }
    if (!h.moneda) { h.moneda = 'ARS'; changed = true; }
  });
  return changed;
}

function cargarHistorial() {
  try {
    const raw = localStorage.getItem('cayo_historial');
    if (raw) {
      const arr = JSON.parse(raw);
      const changed = normalizeHistorial(arr);
      if (changed) localStorage.setItem('cayo_historial', JSON.stringify(arr));
      return arr;
    }
  } catch (_) {}
  return [];
}

// Infiere qué stock restaurar a partir de la descripción (entradas viejas sin _stock)
function inferirStock(h) {
  const d = h.descripcion;
  const ninoM = d.match(/Remera Ni[ñn]x .+ talle (\d+)/);
  if (ninoM) return { tipo: 'nino', talle: ninoM[1] };
  if (d === 'Tote Bag Reposera') return { tipo: 'tote', modelo: 'silla' };
  if (d === 'Tote Bag Vereda')   return { tipo: 'tote', modelo: 'vereda' };
  const adM = d.match(/Remera (.+) talle ([A-Z]+)$/);
  if (adM) {
    const talle = adM[2];
    const nombreVariante = adM[1].trim();
    const variante = Object.entries(LABEL_VARIANTE).find(([, v]) => v === nombreVariante)?.[0];
    if (variante && estado.adultos[talle]) return { tipo: 'adulto', talle, variante };
  }
  return null;
}

function guardar() {
  localStorage.setItem('cayo_stock',     JSON.stringify(estado));
  localStorage.setItem('cayo_historial', JSON.stringify(historial));
  pushToCloud(); // sincronización en segundo plano
}

let estado    = cargarEstado();
let historial = cargarHistorial();

// Historial de auditorías
function cargarAuditorias() {
  try {
    const raw = localStorage.getItem('cayo_auditorias');
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}
let auditorias       = cargarAuditorias();
let auditComparacion = null; // { ajustes, coincidencias, sinContar, diferenciaNeta }

function cargarPedidos() {
  try { return JSON.parse(localStorage.getItem('cayo_pedidos') || '[]'); }
  catch (_) { return []; }
}
let pedidos = cargarPedidos();
function normalizePedidos() {
  let changed = false;
  pedidos.forEach(p => {
    if (!p.items) {
      p.items = [{ tipo: p.tipo, talle: p.talle, variante: p.variante, modelo: p.modelo, cantidad: p.cantidad || 1 }];
      changed = true;
    }
  });
  if (changed) guardarPedidos();
}
normalizePedidos();
let pedidoPagoActualId = null;
let solItemsTemp = [];

function renderSolItemsChips() {
  const el = document.getElementById('sol-items-agregados');
  if (!el) return;
  if (solItemsTemp.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = solItemsTemp.map((it, i) => `
    <span class="sol-item-chip">
      ${(it.cantidad > 1 ? `${it.cantidad}× ` : '') + _itemDesc(it)}
      <button type="button" class="sol-chip-rm" onclick="remSolItem(${i})">✕</button>
    </span>
  `).join('');
}
window.remSolItem = function(i) {
  solItemsTemp.splice(i, 1);
  renderSolItemsChips();
  recalcSolPrecio();
};

function guardarPedidos() {
  localStorage.setItem('cayo_pedidos', JSON.stringify(pedidos));
}

// ── Helpers de stock con pedidos ─────────────────────────────────────────────
function _itemMatchOpts(it, tipo, opts) {
  if (tipo === 'adulto') return it.talle === opts.talle && it.variante === opts.variante;
  if (tipo === 'tote')   return it.modelo === opts.modelo;
  if (tipo === 'nino')   return String(it.talle) === String(opts.talle);
  return false;
}
function countArmados(tipo, opts) {
  return pedidos
    .filter(p => p.estadoFisico === 'armado')
    .reduce((s, p) => s + (p.items || []).filter(it => it.tipo === tipo && _itemMatchOpts(it, tipo, opts)).reduce((is, it) => is + (it.cantidad || 1), 0), 0);
}
function countSolicitudes(tipo, opts) {
  return pedidos
    .filter(p => p.estadoFisico === 'solicitud')
    .reduce((s, p) => s + (p.items || []).filter(it => it.tipo === tipo && _itemMatchOpts(it, tipo, opts)).reduce((is, it) => is + (it.cantidad || 1), 0), 0);
}
function getRawStock(tipo, opts) {
  if (tipo === 'adulto') return estado.adultos[opts.talle]?.[opts.variante] ?? 0;
  if (tipo === 'tote')   return estado.totes[opts.modelo] ?? 0;
  if (tipo === 'nino')   return estado.ninos[opts.talle] ?? 0;
  return 0;
}
function stockDisponible(tipo, opts) {
  return getRawStock(tipo, opts) - countArmados(tipo, opts);
}

// ── Helpers de pedido ────────────────────────────────────────────────────────
function pedidoTotalPagado(p) {
  return (p.pagos || []).reduce((s, pg) => s + pg.monto, 0);
}
function pedidoSaldo(p) {
  return (p.precioTotal || 0) - pedidoTotalPagado(p);
}
function pedidoEstadoPago(p) {
  const saldo = pedidoSaldo(p);
  const pagado = pedidoTotalPagado(p);
  if (saldo <= 0) return 'pagado';
  if (pagado > 0) return 'parcial';
  return 'sin_pago';
}
function _itemDesc(it) {
  if (it.tipo === 'adulto') return `${LABEL_VARIANTE[it.variante] || it.variante} talle ${it.talle}`;
  if (it.tipo === 'tote')   return `Tote ${it.modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
  if (it.tipo === 'nino')   return `Niñx talle ${it.talle}`;
  return 'ítem';
}
function pedidoDescItem(p) {
  const items = p.items || [];
  if (!items.length) return 'ítem';
  return items.map(it => (it.cantidad > 1 ? `${it.cantidad}× ` : '') + _itemDesc(it)).join(' · ');
}

// ── Sincronización con Google Sheets ─────────────────────────────────────────
const GAS_URL_KEY = 'cayo_gas_url';
let gasUrl = localStorage.getItem(GAS_URL_KEY) || '';

function setSincStatus(st) {
  const el = document.getElementById('sinc-icon');
  if (!el) return;
  const icons = { idle: '☁️', syncing: '🔄', ok: '✅', error: '❌' };
  el.textContent = icons[st] ?? '☁️';
}

// Escribe en la nube (fire-and-forget, no-cors evita problemas de CORS/preflight)
async function pushToCloud() {
  if (!gasUrl) return;
  setSincStatus('syncing');
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ stock: estado, historial, auditorias, pedidos }),
    });
    setSincStatus('ok');
  } catch (err) {
    console.warn('[Sync] push error:', err);
    setSincStatus('error');
  }
}

// Lee desde la nube (GET estándar, GAS lo permite cross-origin)
async function pullFromCloud() {
  if (!gasUrl) return null;
  try {
    const resp = await fetch(`${gasUrl}?action=load&_t=${Date.now()}`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.warn('[Sync] pull error:', err);
    return null;
  }
}

// Descarga datos de la nube y actualiza el estado local
async function sincronizarDesdeNube() {
  if (!gasUrl) return;
  setSincStatus('syncing');
  const data = await pullFromCloud();
  if (!data) { setSincStatus('error'); return; }
  let changed = false;
  if (data.stock && typeof data.stock === 'object') {
    estado = data.stock;
    localStorage.setItem('cayo_stock', JSON.stringify(estado));
    changed = true;
  }
  if (Array.isArray(data.historial)) {
    historial = data.historial;
    normalizeHistorial(historial);
    localStorage.setItem('cayo_historial', JSON.stringify(historial));
    changed = true;
  }
  if (Array.isArray(data.auditorias)) {
    auditorias = data.auditorias;
    localStorage.setItem('cayo_auditorias', JSON.stringify(auditorias));
    changed = true;
  }
  if (Array.isArray(data.pedidos)) {
    pedidos = data.pedidos;
    localStorage.setItem('cayo_pedidos', JSON.stringify(pedidos));
    changed = true;
  }
  if (changed) renderTodo();
  setSincStatus('ok');
}

// ── Control de acceso (PIN fijo) ──────────────────────────────────────────────
const EDIT_PIN = '1122';
let modoEdicion = false;

function setModoEdicion(activo) {
  modoEdicion = activo;
  document.body.classList.toggle('modo-lectura', !activo);
  const btn = document.getElementById('btn-lock');
  if (btn) {
    btn.textContent = activo ? '🔓' : '🔒';
    btn.title       = activo ? 'Bloquear edición' : 'Desbloquear edición';
  }
}

// Botón 🔒/🔓
document.getElementById('btn-lock').addEventListener('click', () => {
  if (modoEdicion) {
    setModoEdicion(false);
    return;
  }
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').classList.add('hidden');
  document.getElementById('modal-pin').classList.remove('hidden');
  setTimeout(() => document.getElementById('pin-input').focus(), 80);
});

function confirmarPin() {
  if (document.getElementById('pin-input').value === EDIT_PIN) {
    document.getElementById('modal-pin').classList.add('hidden');
    setModoEdicion(true);
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-input').focus();
  }
}

document.getElementById('btn-confirmar-pin').addEventListener('click', confirmarPin);
document.getElementById('pin-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmarPin();
});
document.getElementById('btn-cancelar-pin').addEventListener('click', () => {
  document.getElementById('modal-pin').classList.add('hidden');
});
document.getElementById('btn-cerrar-pin').addEventListener('click', () => {
  document.getElementById('modal-pin').classList.add('hidden');
});
document.getElementById('modal-pin').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-pin'))
    document.getElementById('modal-pin').classList.add('hidden');
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
window.irATab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'auditoria') { renderAuditoria(); renderHistorialAuditorias(); }
  if (tab === 'ventas')    renderVentas();
  if (tab === 'pedidos')   renderPedidos();
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => irATab(btn.dataset.tab));
});

// ── Render Stock ──────────────────────────────────────────────────────────────
function claseStock(n) {
  if (n === 0) return 'stock-0';
  if (n <= 2)  return 'stock-low';
  return '';
}

function renderAdultos() {
  const tbody = document.getElementById('tbody-adultos');
  const tfoot = document.getElementById('tfoot-adultos');
  const totalesPorTalle = Object.fromEntries(TALLES_ADULTO.map(t => [t, 0]));

  // Acumular totales
  VARIANTES.forEach(v => TALLES_ADULTO.forEach(t => { totalesPorTalle[t] += estado.adultos[t][v]; }));

  tbody.innerHTML = GRUPOS_ADULTO.map(grupo =>
    grupo.variantes.map((v, idx) => {
      const sub = TALLES_ADULTO.reduce((s, t) => s + estado.adultos[t][v], 0);
      const celdaGrupo = idx === 0
        ? `<td class="grupo-label" rowspan="${grupo.variantes.length}">${grupo.nombre}</td>`
        : '';
      const color = COLOR_VARIANTE[v];
      return `<tr class="fila-variante">
        ${celdaGrupo}
        <td class="color-label color-${color.toLowerCase()}">${color}</td>
        ${TALLES_ADULTO.map(t => {
          const disp = stockDisponible('adulto', { talle: t, variante: v });
          const arm  = countArmados('adulto', { talle: t, variante: v });
          const sol  = countSolicitudes('adulto', { talle: t, variante: v });
          const badges = (arm > 0 || sol > 0)
            ? `<div class="stock-reservas">${arm > 0 ? `<span class="badge-arm">${arm} arm.</span>` : ''}${sol > 0 ? `<span class="badge-sol">${sol} sol.</span>` : ''}</div>`
            : '';
          return `<td class="${claseStock(disp)}">${disp}${badges}</td>`;
        }).join('')}
        <td class="subtotal-col">${sub}</td>
      </tr>`;
    }).join('')
  ).join('');

  // Totals use disponible (raw − armados)
  VARIANTES.forEach(v => TALLES_ADULTO.forEach(t => {
    totalesPorTalle[t] -= countArmados('adulto', { talle: t, variante: v });
  }));

  const totalGeneral = TALLES_ADULTO.reduce((s, t) => s + totalesPorTalle[t], 0);
  tfoot.innerHTML = `<tr>
    <td colspan="2">Total</td>
    ${TALLES_ADULTO.map(t => `<td>${totalesPorTalle[t]}</td>`).join('')}
    <td class="subtotal-col">${totalGeneral}</td>
  </tr>`;
  document.getElementById('total-remeras').textContent = totalGeneral;
}

function renderTotes() {
  const tbody = document.getElementById('tbody-totes');
  const t = estado.totes;
  const dispSilla  = stockDisponible('tote', { modelo: 'silla' });
  const dispVereda = stockDisponible('tote', { modelo: 'vereda' });
  const mkBadge = (modelo) => {
    const arm = countArmados('tote', { modelo });
    const sol = countSolicitudes('tote', { modelo });
    return (arm > 0 || sol > 0)
      ? `<div class="stock-reservas">${arm > 0 ? `<span class="badge-arm">${arm} arm.</span>` : ''}${sol > 0 ? `<span class="badge-sol">${sol} sol.</span>` : ''}</div>`
      : '';
  };
  tbody.innerHTML = `
    <tr><td>Reposera</td><td class="${claseStock(dispSilla)}">${dispSilla}${mkBadge('silla')}</td></tr>
    <tr><td>Vereda</td><td class="${claseStock(dispVereda)}">${dispVereda}${mkBadge('vereda')}</td></tr>
    <tr><td style="font-weight:700">Total</td><td style="font-weight:700;color:var(--acento)">${dispSilla + dispVereda}</td></tr>
  `;
  document.getElementById('total-totes').textContent = dispSilla + dispVereda;
}

function renderNinos() {
  const tbody = document.getElementById('tbody-ninos');
  const tfoot = document.getElementById('tfoot-ninos');
  const n = estado.ninos;
  let total = 0;
  tbody.innerHTML = TALLES_NINO.map(t => {
    const disp = stockDisponible('nino', { talle: t });
    const arm  = countArmados('nino', { talle: t });
    const sol  = countSolicitudes('nino', { talle: t });
    total += disp;
    const badges = (arm > 0 || sol > 0)
      ? `<div class="stock-reservas">${arm > 0 ? `<span class="badge-arm">${arm} arm.</span>` : ''}${sol > 0 ? `<span class="badge-sol">${sol} sol.</span>` : ''}</div>`
      : '';
    return `<tr><td class="talle-label">${t}</td><td class="${claseStock(disp)}">${disp}${badges}</td></tr>`;
  }).join('');
  tfoot.innerHTML = `<tr><td>Total</td><td style="color:var(--acento);font-weight:700">${total}</td></tr>`;
  document.getElementById('total-ninos').textContent = total;
}

function formatPeso(n) {
  return '$' + n.toLocaleString('es-AR');
}

function renderRecaudado() {
  const arsHist = historial.filter(h => (h.moneda || 'ARS') === 'ARS').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const uyuHist = historial.filter(h => (h.moneda || 'ARS') === 'UYU').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const arsPed  = pedidos.filter(p => (p.moneda || 'UYU') === 'ARS').reduce((s, p) => s + (p.pagos || []).reduce((ps, pg) => ps + pg.monto, 0), 0);
  const uyuPed  = pedidos.filter(p => (p.moneda || 'UYU') === 'UYU').reduce((s, p) => s + (p.pagos || []).reduce((ps, pg) => ps + pg.monto, 0), 0);
  const totalARS = arsHist + arsPed;
  const totalUYU = uyuHist + uyuPed;

  const arsEl = document.getElementById('recaudado-ars');
  const uyuEl = document.getElementById('recaudado-uyu');
  if (arsEl) arsEl.textContent = totalARS > 0 ? `🇦🇷 ${formatPeso(totalARS)}` : '';
  if (uyuEl) uyuEl.textContent = totalUYU > 0 ? `🇺🇾 ${formatPeso(totalUYU)}` : '';

  const card = document.getElementById('card-recaudado');
  if (card) card.style.display = (totalARS > 0 || totalUYU > 0) ? '' : 'none';
}

function renderTodo() {
  renderAdultos();
  renderTotes();
  renderNinos();
  renderRecaudado();
  if (!document.getElementById('tab-ventas').classList.contains('hidden'))  renderVentas();
  if (!document.getElementById('tab-pedidos').classList.contains('hidden')) renderPedidos();
}

// ── Tab Ventas ────────────────────────────────────────────────────────────────
let filtroVentas = 'todos';

function renderVentas() {
  // Totales globales separados por moneda
  const cobradas     = historial.filter(h => h.pago === 'efectivo' || h.pago === 'transferencia');
  const unidRemera   = cobradas.filter(h => h._stock?.tipo === 'adulto').reduce((s, h) => s + h.cantidad, 0);
  const unidTote     = cobradas.filter(h => h._stock?.tipo === 'tote').reduce((s, h) => s + h.cantidad, 0);
  const unidNino     = cobradas.filter(h => h._stock?.tipo === 'nino').reduce((s, h) => s + h.cantidad, 0);
  const pegEntradas  = historial.filter(h => h._stock?.tipo === 'pegotines');
  const totalPegARS  = pegEntradas.filter(h => (h.moneda||'ARS')==='ARS').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalPegUYU  = pegEntradas.filter(h => (h.moneda||'ARS')==='UYU').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalUnid    = unidRemera + unidTote + unidNino;
  const totalARS     = historial.filter(h => (h.moneda || 'ARS') === 'ARS').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalUYU     = historial.filter(h => (h.moneda || 'ARS') === 'UYU').reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalEfec    = historial.reduce((s, h) => s + (h.pago === 'efectivo'      ? (h.ingreso ?? 0) : 0), 0);
  const totalTrans   = historial.reduce((s, h) => s + (h.pago === 'transferencia' ? (h.ingreso ?? 0) : 0), 0);
  const totalRegU    = historial.reduce((s, h) => h.pago === 'regalo' ? s + h.cantidad : s, 0);
  const totalAnotaM  = historial.reduce((s, h) => h.pago === 'anota'  ? s + (h.precioUnit || 0) * h.cantidad : s, 0);

  document.getElementById('v-unidades').textContent  = totalUnid;
  const desglEl = document.getElementById('v-unidades-desglose');
  if (desglEl) {
    const parts = [];
    if (unidRemera) parts.push(`👕 ${unidRemera} remera${unidRemera !== 1 ? 's' : ''}`);
    if (unidTote)   parts.push(`👜 ${unidTote} tote${unidTote !== 1 ? 's' : ''}`);
    if (unidNino)   parts.push(`👶 ${unidNino} niñx`);
    desglEl.textContent = parts.join(' · ');
  }
  document.getElementById('v-total-ars').textContent = formatPeso(totalARS);
  document.getElementById('v-total-uyu').textContent = formatPeso(totalUYU);
  document.getElementById('v-efectivo').textContent  = formatPeso(totalEfec);
  document.getElementById('v-transf').textContent    = formatPeso(totalTrans);
  document.getElementById('v-regalos').textContent   = `${totalRegU} u.`;
  document.getElementById('v-anota').textContent     = formatPeso(totalAnotaM);

  // Card pegotines — solo visible si hay entradas
  const vcardPeg = document.getElementById('vcard-pegotines');
  if (vcardPeg) {
    const hayPeg = totalPegARS > 0 || totalPegUYU > 0;
    vcardPeg.classList.toggle('hidden', !hayPeg);
    if (hayPeg) {
      const plataParts = [];
      if (totalPegARS > 0) plataParts.push(formatPeso(totalPegARS));
      if (totalPegUYU > 0) plataParts.push(formatPeso(totalPegUYU) + ' UYU');
      document.getElementById('v-pegotines-plata').textContent = plataParts.join(' · ');
    }
  }

  // Anotados panel — combina ventas "anota" + pedidos con saldo pendiente
  const anotadosEl = document.getElementById('anotados-panel');
  if (anotadosEl) {
    const porPersona = {};

    const agregar = (nombre, desc, monto, moneda) => {
      const k = nombre || '(sin nombre)';
      if (!porPersona[k]) porPersona[k] = { items: [], montos: {} };
      if (desc) porPersona[k].items.push(desc);
      if (monto > 0) porPersona[k].montos[moneda] = (porPersona[k].montos[moneda] || 0) + monto;
    };

    // Ventas registradas como "anota"
    historial.filter(h => h.pago === 'anota').forEach(h => {
      const mon = h.moneda || 'ARS';
      agregar(h.nombreAnota, h.descripcion + (h.cantidad > 1 ? ` ×${h.cantidad}` : ''), (h.precioUnit || 0) * h.cantidad, mon);
    });

    // Solicitudes/pedidos no cancelados con saldo > 0
    pedidos.filter(p => p.estadoFisico !== 'cancelado' && pedidoSaldo(p) > 0).forEach(p => {
      const mon = p.moneda || 'UYU';
      agregar(p.para, pedidoDescItem(p), pedidoSaldo(p), mon);
    });

    const filas = Object.entries(porPersona);
    if (filas.length === 0) {
      anotadosEl.classList.add('hidden');
    } else {
      anotadosEl.innerHTML = `<h4 class="anotados-titulo">📝 Anotados — cuentas pendientes</h4>
        ${filas.map(([nombre, data]) => {
          const montoTxt = Object.entries(data.montos)
            .map(([mon, monto]) => `${formatPeso(monto)}${mon === 'UYU' ? ' UYU' : ''}`)
            .join(' · ');
          const detalle = data.items.length ? data.items.join(', ') : '';
          return `<div class="anotados-row">
            <span class="anotados-nombre">👤 ${nombre}</span>
            ${detalle ? `<span class="anotados-detalle">${detalle}</span>` : ''}
            <span class="anotados-monto">Debe ${montoTxt || '—'}</span>
          </div>`;
        }).join('')}`;
      anotadosEl.classList.remove('hidden');
    }
  }

  const filtrados = filtroVentas === 'todos'
    ? historial
    : historial.filter(h => h.pago === filtroVentas);

  const lista = document.getElementById('ventas-lista');

  if (historial.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">Todavía no hay ventas registradas.<br>Usá el botón <strong>+ Registrar</strong> para agregar una.</p>';
    return;
  }
  if (filtrados.length === 0) {
    lista.innerHTML = '<p class="historial-vacio">No hay ventas con ese método de pago.</p>';
    return;
  }

  lista.innerHTML = filtrados.map(h => {
    const pagoLabel = h.pago === 'transferencia' ? 'Transf.'
                    : h.pago === 'regalo'        ? '🎁 Regalo'
                    : h.pago === 'anota'         ? '📝 Anota'
                    : 'Efect.';
    const monedaBadge = h.moneda === 'UYU'
      ? '<span class="moneda-badge moneda-uyu">UYU</span>'
      : '<span class="moneda-badge moneda-ars">ARS</span>';
    const pegotinesBadge = h._stock?.tipo === 'pegotines'
      ? '<span class="pegotines-badge">🎟️ Pegotines</span>' : '';
    const nombreHtml = h.pago === 'anota' && h.nombreAnota
      ? `<span class="anota-nombre">👤 ${h.nombreAnota}</span>` : '';
    const montoHtml = h.pago === 'anota'
      ? `<span class="venta-ingreso anota-adeuda">Adeuda ${formatPeso((h.precioUnit||0)*h.cantidad)}</span>`
      : `<span class="venta-ingreso">${h.ingreso ? formatPeso(h.ingreso) : '—'}</span>`;
    const edicionesHtml = h._ediciones?.length
      ? `<div class="ediciones-log">${h._ediciones.map(e =>
          `<div class="edicion-entrada">📝 ${e.fecha}: ${e.detalle}</div>`
        ).join('')}</div>`
      : '';
    return `
    <div class="venta-item${h._ediciones?.length ? ' tiene-ediciones' : ''}${h.pago === 'anota' ? ' venta-anota' : ''}${h._stock?.tipo === 'pegotines' ? ' venta-pegotines' : ''}">
      <div class="venta-item-main">
        <span class="venta-desc">${h.descripcion}${pegotinesBadge}${nombreHtml}</span>
        <span class="venta-cant">-${h.cantidad}</span>
        ${montoHtml}
        <span class="hist-pago hist-pago--${h.pago ?? 'efectivo'}">${pagoLabel}</span>
        ${monedaBadge}
        <span class="hist-acciones">
          <button class="btn-hist-edit" onclick="abrirEditar(${h.id})" title="Editar">✏️</button>
          <button class="btn-hist-del"  onclick="eliminarRegistro(${h.id})" title="Eliminar">🗑️</button>
        </span>
      </div>
      <div class="venta-item-meta">
        <span class="venta-precio-unit">${h.precioUnit ? formatPeso(h.precioUnit) + ' c/u' : ''}</span>
        <span class="hist-fecha">${h.fecha}</span>
      </div>
      ${edicionesHtml}
    </div>`;
  }).join('');
}

// Filtros de la pestaña Ventas
document.querySelectorAll('.filtro-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroVentas = btn.dataset.filtro;
    renderVentas();
  });
});

// ── Modal Venta ───────────────────────────────────────────────────────────────
const modalVenta       = document.getElementById('modal-venta');
const selCategoria     = document.getElementById('venta-categoria');
const camposAdulto     = document.getElementById('campos-adulto');
const camposNino       = document.getElementById('campos-nino');
const camposTote       = document.getElementById('campos-tote');
const selTalleAdulto   = document.getElementById('venta-talle-adulto');
const selVarianteAdulto = document.getElementById('venta-variante-adulto');
const selTalleNino     = document.getElementById('venta-talle-nino');
const selTote          = document.getElementById('venta-tote');
const inputCantidad      = document.getElementById('venta-cantidad');
const inputPrecioOverride = document.getElementById('venta-precio-override');
const pDisponible      = document.getElementById('venta-disponible');
const pError           = document.getElementById('venta-error');

function ocultarCampos() {
  [camposAdulto, camposNino, camposTote].forEach(c => c.classList.add('hidden'));
}

function getMonedaVenta() {
  return document.querySelector('input[name="moneda-venta"]:checked')?.value || 'UYU';
}

function precioBase(cat) {
  const moneda = getMonedaVenta();
  if (moneda === 'UYU') {
    if (cat === 'tote') return PRECIOS.tote_uyu;
    if (cat === 'nino') return PRECIOS.nino_uyu;
    return PRECIOS.remera_uyu;
  }
  if (cat === 'tote') return PRECIOS.tote;
  return PRECIOS.remera;
}

function precioBaseSol(tipo, moneda) {
  if (moneda === 'UYU') {
    if (tipo === 'tote') return PRECIOS.tote_uyu;
    if (tipo === 'nino') return PRECIOS.nino_uyu;
    return PRECIOS.remera_uyu;
  }
  if (tipo === 'tote') return PRECIOS.tote;
  return PRECIOS.remera;
}

function recalcSolPrecio() {
  const precioEl = document.getElementById('sol-precio');
  if (!precioEl || precioEl.dataset.autoset === 'false') return;
  const moneda = document.querySelector('input[name="moneda-sol"]:checked')?.value || 'UYU';
  const cat  = document.getElementById('sol-categoria')?.value;
  const cant = parseInt(document.getElementById('sol-cantidad')?.value, 10) || 1;
  let total = solItemsTemp.reduce((s, it) => s + precioBaseSol(it.tipo, moneda) * it.cantidad, 0);
  if (cat) total += precioBaseSol(cat, moneda) * cant;
  precioEl.value = total > 0 ? total : '';
  precioEl.dataset.autoset = 'true';
}

function precioEfectivo() {
  const override = parseInt(inputPrecioOverride.value, 10);
  if (!isNaN(override) && override > 0) return override;
  const base = precioBase(selCategoria.value);
  return base > 0 ? base : 0;
}

function actualizarDisponible() {
  const cat   = selCategoria.value;
  let disp    = null;

  if (cat === 'adulto') {
    disp = stockDisponible('adulto', { talle: selTalleAdulto.value, variante: selVarianteAdulto.value });
  } else if (cat === 'nino') {
    disp = stockDisponible('nino', { talle: selTalleNino.value });
  } else if (cat === 'tote') {
    disp = stockDisponible('tote', { modelo: selTote.value });
  }

  const cant        = parseInt(inputCantidad.value, 10) || 1;
  const precio      = precioEfectivo();
  const pUnit       = document.getElementById('venta-precio-unit');
  const pTotalVenta = document.getElementById('venta-total-venta');

  const moneda = getMonedaVenta();
  inputPrecioOverride.placeholder = moneda === 'UYU' ? 'Ingresá el precio (UYU)' : 'Precio por defecto (ARS)';

  if (cat === 'pegotines') {
    pDisponible.textContent = '';
    if (precio > 0) {
      pUnit.textContent       = `Precio: ${formatPeso(precio)} c/u`;
      pTotalVenta.textContent = `Total: ${formatPeso(precio * cant)}`;
    } else {
      pUnit.textContent       = '⚠️ Ingresá el precio';
      pTotalVenta.textContent = '';
    }
  } else if (disp !== null) {
    pDisponible.textContent = `Disponible: ${disp}`;
    pDisponible.style.color = disp === 0 ? 'var(--acento)' : 'var(--verde)';
    if (precio > 0) {
      pUnit.textContent       = `Precio: ${formatPeso(precio)} c/u`;
      pTotalVenta.textContent = `Total: ${formatPeso(precio * cant)}`;
    } else {
      pUnit.textContent       = moneda === 'UYU' ? '⚠️ Ingresá el precio en UYU' : '';
      pTotalVenta.textContent = '';
    }
  } else {
    pDisponible.textContent = '';
    pUnit.textContent       = '';
    pTotalVenta.textContent = '';
  }
}

selCategoria.addEventListener('change', () => {
  ocultarCampos();
  const cat = selCategoria.value;
  if (cat === 'adulto') camposAdulto.classList.remove('hidden');
  else if (cat === 'nino') camposNino.classList.remove('hidden');
  else if (cat === 'tote') camposTote.classList.remove('hidden');
  const esPeg = cat === 'pegotines';
  document.getElementById('label-cantidad').classList.toggle('hidden', esPeg);
  document.getElementById('label-precio-txt').textContent = esPeg ? 'Monto total ($)' : 'Precio unitario ($)';
  inputPrecioOverride.placeholder = esPeg ? 'Ingresá el monto total' : 'Precio por defecto';
  if (esPeg) inputCantidad.value = 1;
  actualizarDisponible();
});

[selTalleAdulto, selVarianteAdulto, selTalleNino, selTote, inputCantidad, inputPrecioOverride].forEach(el =>
  el.addEventListener('change', actualizarDisponible)
);
inputCantidad.addEventListener('input', actualizarDisponible);
inputPrecioOverride.addEventListener('input', actualizarDisponible);

// Mostrar/ocultar campo nombre cuando se elige Anota
document.querySelectorAll('input[name="pago"]').forEach(r => {
  r.addEventListener('change', () => {
    const isAnota = document.querySelector('input[name="pago"]:checked')?.value === 'anota';
    document.getElementById('campos-anota-nombre').classList.toggle('hidden', !isAnota);
    if (isAnota) {
      const dl = document.getElementById('anota-nombres-list');
      const nombres = [...new Set(pedidos.filter(p => p.estadoFisico !== 'cancelado').map(p => p.para).filter(Boolean))];
      dl.innerHTML = nombres.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
    }
    actualizarDisponible();
  });
});

document.querySelectorAll('input[name="moneda-venta"]').forEach(r =>
  r.addEventListener('change', actualizarDisponible)
);

document.getElementById('btn-venta').addEventListener('click', () => {
  selCategoria.value = '';
  ocultarCampos();
  inputCantidad.value = 1;
  inputPrecioOverride.value = '';
  document.getElementById('venta-nombre-anota').value = '';
  document.getElementById('campos-anota-nombre').classList.add('hidden');
  pDisponible.textContent = '';
  pError.classList.add('hidden');
  document.getElementById('venta-precio-unit').textContent  = '';
  document.getElementById('venta-total-venta').textContent  = '';
  // Default UYU for new sales
  const uyu = document.querySelector('input[name="moneda-venta"][value="UYU"]');
  if (uyu) uyu.checked = true;
  inputPrecioOverride.placeholder = 'Ingresá el precio (UYU)';
  modalVenta.classList.remove('hidden');
});

document.getElementById('btn-cancelar-venta').addEventListener('click', () => {
  modalVenta.classList.add('hidden');
});

document.getElementById('form-venta').addEventListener('submit', e => {
  e.preventDefault();
  pError.classList.add('hidden');

  const cat  = selCategoria.value;
  const cant = parseInt(inputCantidad.value, 10);
  if (!cat || isNaN(cant) || cant < 1) return;

  let descripcion = '';
  let disponible  = 0;
  let precio      = 0;
  let _stock;

  if (cat === 'adulto') {
    const talle    = selTalleAdulto.value;
    const variante = selVarianteAdulto.value;
    disponible = stockDisponible('adulto', { talle, variante });
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.adultos[talle][variante] -= cant;
    descripcion = `Remera ${LABEL_VARIANTE[variante]} talle ${talle}`;
    precio      = PRECIOS.remera;
    _stock      = { tipo: 'adulto', talle, variante };

  } else if (cat === 'nino') {
    const talle = selTalleNino.value;
    disponible  = stockDisponible('nino', { talle });
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.ninos[talle] -= cant;
    descripcion = `Remera Niñx Reposera Roja talle ${talle}`;
    precio      = PRECIOS.remera;
    _stock      = { tipo: 'nino', talle };

  } else if (cat === 'tote') {
    const modelo = selTote.value;
    disponible   = stockDisponible('tote', { modelo });
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.totes[modelo] -= cant;
    descripcion = `Tote Bag ${modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
    precio      = PRECIOS.tote;
    _stock      = { tipo: 'tote', modelo };

  } else if (cat === 'pegotines') {
    descripcion = 'Pegotines';
    _stock      = { tipo: 'pegotines' };
    cant        = 1; // para pegotines el monto es el total, no hay unidades
  }

  // Precio final: override manual o precio por defecto
  const precioFinal = precioEfectivo();
  const moneda      = getMonedaVenta();
  if (!precioFinal || precioFinal <= 0) {
    mostrarError('Ingresá un precio válido.');
    return;
  }
  const pago = document.querySelector('input[name="pago"]:checked').value;

  // Validar nombre si es Anota
  let nombreAnota = '';
  if (pago === 'anota') {
    nombreAnota = document.getElementById('venta-nombre-anota').value.trim();
    if (!nombreAnota) { mostrarError('Ingresá el nombre de quien anota.'); return; }
  }

  const ingreso = (pago === 'regalo' || pago === 'anota') ? 0 : precioFinal * cant;

  const entrada = {
    id: Date.now(),
    fecha: new Date().toLocaleString('es-AR'),
    descripcion,
    cantidad:  cant,
    ingreso,
    pago,
    moneda,
    precioUnit: precioFinal,
    _stock,
  };
  if (nombreAnota) entrada.nombreAnota = nombreAnota;
  historial.unshift(entrada);

  guardar();
  renderTodo();
  modalVenta.classList.add('hidden');
  // Reset radio pago a efectivo y limpiar nombre
  document.querySelector('input[name="pago"][value="efectivo"]').checked = true;
  document.getElementById('venta-nombre-anota').value = '';
  document.getElementById('campos-anota-nombre').classList.add('hidden');
});

function mostrarError(msg) {
  pError.textContent = msg;
  pError.classList.remove('hidden');
}

// ── Modal Historial ───────────────────────────────────────────────────────────
const modalHistorial = document.getElementById('modal-historial');

function buildResumen() {
  const cats = {};
  for (const h of historial) {
    const key = h.descripcion.startsWith('Remera Niñx') ? 'Niñx Reposera Roja'
               : h.descripcion.startsWith('Tote')       ? h.descripcion
               : h.descripcion.match(/Remera (.+) talle/)
                 ? `Remera ${h.descripcion.match(/Remera (.+) talle/)[1]}`
                 : h.descripcion;
    if (!cats[key]) cats[key] = { unidades: 0, ingreso: 0 };
    cats[key].unidades += h.cantidad;
    cats[key].ingreso  += h.ingreso ?? 0;
  }
  return cats;
}

function abrirHistorial() {
  const contenedor = document.getElementById('lista-historial');
  const lblTotal   = document.getElementById('historial-total-recaudado');
  const totalRecaudado = historial.reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalUnidades  = historial.reduce((s, h) => s + h.cantidad, 0);

  if (historial.length === 0) {
    lblTotal.textContent  = '';
    contenedor.innerHTML  = '<p class="historial-vacio">Sin ventas registradas.</p>';
    document.getElementById('modal-historial').classList.remove('hidden');
    return;
  }

  const totalEfectivo      = historial.reduce((s, h) => s + (h.pago === 'efectivo'      ? (h.ingreso ?? 0) : 0), 0);
  const totalTransferencia = historial.reduce((s, h) => s + (h.pago === 'transferencia' ? (h.ingreso ?? 0) : 0), 0);
  const totalRegalosUnid   = historial.reduce((s, h) => s + (h.pago === 'regalo' ? h.cantidad : 0), 0);

  lblTotal.innerHTML = `
    <span>Vendido: <strong>${totalUnidades} u.</strong></span>
    <span>Efectivo: <strong>${formatPeso(totalEfectivo)}</strong></span>
    <span>Transf.: <strong>${formatPeso(totalTransferencia)}</strong></span>
    <span>Total: <strong>${formatPeso(totalRecaudado)}</strong></span>
    ${totalRegalosUnid > 0 ? `<span class="hist-regalo-resumen">🎁 Regalos: <strong>${totalRegalosUnid} u.</strong></span>` : ''}
  `;

  const resumen = buildResumen();
  const filas = Object.entries(resumen)
    .sort((a, b) => b[1].ingreso - a[1].ingreso)
    .map(([nombre, d]) => {
      const pct = totalRecaudado > 0 ? (d.ingreso / totalRecaudado * 100) : 0;
      return `
        <div class="resumen-fila">
          <div class="resumen-nombre">${nombre}</div>
          <div class="resumen-barra-wrap">
            <div class="resumen-barra" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="resumen-nums">
            <span class="resumen-unidades">${d.unidades} u.</span>
            <span class="resumen-monto">${formatPeso(d.ingreso)}</span>
          </div>
        </div>`;
    }).join('');

  const detalle = historial.map(h => {
    const edicionesHtml = h._ediciones?.length
      ? `<div class="ediciones-log">${h._ediciones.map(e =>
          `<div class="edicion-entrada">📝 ${e.fecha}: ${e.detalle}</div>`
        ).join('')}</div>`
      : '';
    const pagoLbl = h.pago === 'transferencia' ? 'Transf.'
                  : h.pago === 'regalo'        ? '🎁 Regalo'
                  : h.pago === 'anota'         ? '📝 Anota'
                  : 'Efect.';
    const nombreHtml = h.pago === 'anota' && h.nombreAnota
      ? ` <span class="anota-nombre">👤 ${h.nombreAnota}</span>` : '';
    const ingresoHtml = h.pago === 'anota'
      ? `<span class="hist-ingreso anota-adeuda">Adeuda ${formatPeso((h.precioUnit||0)*h.cantidad)}</span>`
      : `<span class="hist-ingreso">${h.ingreso ? formatPeso(h.ingreso) : ''}</span>`;
    return `
    <div class="historial-item${h._ediciones?.length ? ' tiene-ediciones' : ''}${h.pago === 'anota' ? ' historial-anota' : ''}">
      <span class="hist-desc">${h.descripcion}${nombreHtml}</span>
      <span class="hist-cant">-${h.cantidad}</span>
      ${ingresoHtml}
      <span class="hist-pago hist-pago--${h.pago ?? 'efectivo'}">${pagoLbl}</span>
      <span class="hist-fecha">${h.fecha}</span>
      <span class="hist-acciones">
        <button class="btn-hist-edit" onclick="abrirEditar(${h.id})" title="Editar registro">✏️</button>
        <button class="btn-hist-del"  onclick="eliminarRegistro(${h.id})" title="Eliminar y devolver stock">🗑️</button>
      </span>
    </div>${edicionesHtml}`;
  }).join('');

  contenedor.innerHTML = `
    <div class="resumen-section">
      <h3 class="resumen-titulo">Resumen por producto</h3>
      ${filas}
    </div>
    <h3 class="detalle-titulo">Detalle cronológico</h3>
    <div class="detalle-lista">${detalle}</div>
  `;

  modalHistorial.classList.remove('hidden');
}

document.getElementById('btn-historial').addEventListener('click', abrirHistorial);

document.getElementById('btn-cerrar-historial').addEventListener('click', () => {
  modalHistorial.classList.add('hidden');
});

// ── Editar registro (full edit) ───────────────────────────────────────────────
let editandoId = null;
let editandoDesdeHistorial = false;
const modalEditar = document.getElementById('modal-editar');

const selEditCategoria   = document.getElementById('editar-categoria');
const editCamposAdulto   = document.getElementById('editar-campos-adulto');
const editCamposNino     = document.getElementById('editar-campos-nino');
const editCamposTote     = document.getElementById('editar-campos-tote');
const selEditTalleAdulto = document.getElementById('editar-talle-adulto');
const selEditVariante    = document.getElementById('editar-variante-adulto');
const selEditTalleNino   = document.getElementById('editar-talle-nino');
const selEditTote        = document.getElementById('editar-tote');
const inputEditCantidad  = document.getElementById('editar-cantidad');
const inputEditPrecio    = document.getElementById('editar-precio');

function ocultarCamposEditar() {
  [editCamposAdulto, editCamposNino, editCamposTote].forEach(c => c.classList.add('hidden'));
}

function mostrarCamposEditar(cat) {
  ocultarCamposEditar();
  if (cat === 'adulto') editCamposAdulto.classList.remove('hidden');
  else if (cat === 'nino') editCamposNino.classList.remove('hidden');
  else if (cat === 'tote') editCamposTote.classList.remove('hidden');
}

function actualizarResumenEditar() {
  const cant  = parseInt(inputEditCantidad.value, 10) || 1;
  const precio = parseInt(inputEditPrecio.value, 10) || 0;
  const pago  = document.querySelector('input[name="editar-pago"]:checked')?.value;
  document.getElementById('editar-precio-unit').textContent  = precio ? `Precio: ${formatPeso(precio)} c/u` : '';
  document.getElementById('editar-total-venta').textContent  = precio && pago !== 'regalo' ? `Total: ${formatPeso(precio * cant)}` : pago === 'regalo' ? '🎁 Regalo' : '';
}

selEditCategoria.addEventListener('change', () => {
  mostrarCamposEditar(selEditCategoria.value);
  actualizarResumenEditar();
});

document.querySelectorAll('input[name="editar-pago"]').forEach(r => {
  r.addEventListener('change', () => {
    const isAnota = document.querySelector('input[name="editar-pago"]:checked')?.value === 'anota';
    document.getElementById('editar-campos-anota-nombre').classList.toggle('hidden', !isAnota);
    actualizarResumenEditar();
  });
});
[selEditTalleAdulto, selEditVariante, selEditTalleNino, selEditTote, inputEditCantidad, inputEditPrecio].forEach(el =>
  el.addEventListener('change', actualizarResumenEditar)
);
inputEditCantidad.addEventListener('input', actualizarResumenEditar);
inputEditPrecio.addEventListener('input', actualizarResumenEditar);
document.querySelectorAll('input[name="editar-pago"]').forEach(r =>
  r.addEventListener('change', actualizarResumenEditar)
);

window.abrirEditar = function(id) {
  const h = historial.find(x => x.id === id);
  if (!h) return;
  editandoId = id;
  // Cerrar historial antes de abrir edición (evita modales apilados en iOS)
  editandoDesdeHistorial = !modalHistorial.classList.contains('hidden');
  modalHistorial.classList.add('hidden');

  document.getElementById('editar-info').textContent =
    `${h.descripcion} — ${h.cantidad} u. — ${h.fecha}`;
  document.getElementById('editar-error').classList.add('hidden');

  // Determinar categoría, talle, variante/modelo desde _stock o inferirStock
  const ref = h._stock || inferirStock(h);
  let cat = 'adulto', talle = 'S', variante = 'veredaRoja', talleNino = '2', modelo = 'silla';

  if (ref) {
    cat = ref.tipo;
    if (cat === 'adulto') { talle = ref.talle; variante = ref.variante; }
    else if (cat === 'nino')  talleNino = String(ref.talle);
    else if (cat === 'tote')  modelo    = ref.modelo;
  }

  selEditCategoria.value = cat;
  mostrarCamposEditar(cat);

  selEditTalleAdulto.value = talle;
  selEditVariante.value    = variante;
  selEditTalleNino.value   = talleNino;
  selEditTote.value        = modelo;
  inputEditCantidad.value  = h.cantidad;
  inputEditPrecio.value    = h.precioUnit ?? '';

  document.querySelectorAll('input[name="editar-pago"]').forEach(r => {
    r.checked = r.value === (h.pago ?? 'efectivo');
  });
  document.querySelectorAll('input[name="editar-moneda"]').forEach(r => {
    r.checked = r.value === (h.moneda ?? 'ARS');
  });

  const isAnota = (h.pago === 'anota');
  document.getElementById('editar-campos-anota-nombre').classList.toggle('hidden', !isAnota);
  document.getElementById('editar-nombre-anota').value = h.nombreAnota || '';

  actualizarResumenEditar();
  modalEditar.classList.remove('hidden');
};

document.getElementById('btn-confirmar-editar').addEventListener('click', () => {
  const h = historial.find(x => x.id === editandoId);
  if (!h) return;

  const errEl = document.getElementById('editar-error');
  errEl.classList.add('hidden');

  const nuevaCat   = selEditCategoria.value;
  const nuevaCant  = parseInt(inputEditCantidad.value, 10);
  const nuevoPrecioInput = parseInt(inputEditPrecio.value, 10);
  if (!nuevaCat || isNaN(nuevaCant) || nuevaCant < 1) return;

  const nuevoPago = document.querySelector('input[name="editar-pago"]:checked').value;

  // Validar nombre si es Anota
  let nuevoNombreAnota = '';
  if (nuevoPago === 'anota') {
    nuevoNombreAnota = document.getElementById('editar-nombre-anota').value.trim();
    if (!nuevoNombreAnota) {
      errEl.textContent = 'Ingresá el nombre de quien anota.';
      errEl.classList.remove('hidden');
      return;
    }
  }

  // Precio: usa el del input si es válido, si no conserva el original
  const nuevoPrecio = (!isNaN(nuevoPrecioInput) && nuevoPrecioInput >= 0)
    ? nuevoPrecioInput
    : (h.precioUnit ?? 0);

  // 1. Restaurar stock anterior
  const refViejo = h._stock || inferirStock(h);
  if (refViejo) {
    const { tipo, talle, variante, modelo } = refViejo;
    if (tipo === 'adulto') estado.adultos[talle][variante] += h.cantidad;
    else if (tipo === 'nino') estado.ninos[talle] = (estado.ninos[talle] ?? 0) + h.cantidad;
    else if (tipo === 'tote') estado.totes[modelo] += h.cantidad;
  }

  // 2. Calcular nuevo _stock y descripción
  let nuevaDesc = '';
  let nuevo_stock;

  if (nuevaCat === 'adulto') {
    const talle    = selEditTalleAdulto.value;
    const variante = selEditVariante.value;
    const disp     = estado.adultos[talle]?.[variante] ?? 0;
    if (nuevaCant > disp) {
      if (refViejo) {
        const { tipo, talle: t, variante: v, modelo: m } = refViejo;
        if (tipo === 'adulto') estado.adultos[t][v] -= h.cantidad;
        else if (tipo === 'nino') estado.ninos[t] -= h.cantidad;
        else if (tipo === 'tote') estado.totes[m] -= h.cantidad;
      }
      errEl.textContent = `Stock insuficiente para ${LABEL_VARIANTE[variante]} talle ${talle}. Disponible: ${disp}`;
      errEl.classList.remove('hidden');
      return;
    }
    estado.adultos[talle][variante] -= nuevaCant;
    nuevaDesc   = `Remera ${LABEL_VARIANTE[variante]} talle ${talle}`;
    nuevo_stock = { tipo: 'adulto', talle, variante };

  } else if (nuevaCat === 'nino') {
    const talle = selEditTalleNino.value;
    const disp  = estado.ninos[talle] ?? 0;
    if (nuevaCant > disp) {
      if (refViejo) {
        const { tipo, talle: t, variante: v, modelo: m } = refViejo;
        if (tipo === 'adulto') estado.adultos[t][v] -= h.cantidad;
        else if (tipo === 'nino') estado.ninos[t] -= h.cantidad;
        else if (tipo === 'tote') estado.totes[m] -= h.cantidad;
      }
      errEl.textContent = `Stock insuficiente para talle ${talle}. Disponible: ${disp}`;
      errEl.classList.remove('hidden');
      return;
    }
    estado.ninos[talle] -= nuevaCant;
    nuevaDesc   = `Remera Niñx Reposera Roja talle ${talle}`;
    nuevo_stock = { tipo: 'nino', talle };

  } else if (nuevaCat === 'tote') {
    const modelo = selEditTote.value;
    const disp   = estado.totes[modelo] ?? 0;
    if (nuevaCant > disp) {
      if (refViejo) {
        const { tipo, talle: t, variante: v, modelo: m } = refViejo;
        if (tipo === 'adulto') estado.adultos[t][v] -= h.cantidad;
        else if (tipo === 'nino') estado.ninos[t] -= h.cantidad;
        else if (tipo === 'tote') estado.totes[m] -= h.cantidad;
      }
      errEl.textContent = `Stock insuficiente. Disponible: ${disp}`;
      errEl.classList.remove('hidden');
      return;
    }
    estado.totes[modelo] -= nuevaCant;
    nuevaDesc   = `Tote Bag ${modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
    nuevo_stock = { tipo: 'tote', modelo };
  }

  // 3. Registrar modificaciones
  const cambios = [];
  if (h.descripcion !== nuevaDesc)
    cambios.push(`Producto: "${h.descripcion}" → "${nuevaDesc}"`);
  if (h.cantidad !== nuevaCant)
    cambios.push(`Cantidad: ${h.cantidad} → ${nuevaCant}`);
  if ((h.precioUnit ?? 0) !== nuevoPrecio)
    cambios.push(`Precio: ${formatPeso(h.precioUnit ?? 0)} → ${formatPeso(nuevoPrecio)}`);
  if ((h.pago ?? 'efectivo') !== nuevoPago)
    cambios.push(`Pago: ${h.pago ?? 'efectivo'} → ${nuevoPago}`);
  if (nuevoPago === 'anota' && h.nombreAnota !== nuevoNombreAnota)
    cambios.push(`Nombre: "${h.nombreAnota || ''}" → "${nuevoNombreAnota}"`);
  if (cambios.length > 0) {
    h._ediciones = h._ediciones || [];
    h._ediciones.push({ fecha: new Date().toLocaleString('es-AR'), detalle: cambios.join(' | ') });
  }

  // 4. Actualizar entrada del historial
  h.descripcion  = nuevaDesc;
  h.cantidad     = nuevaCant;
  h.pago         = nuevoPago;
  h.precioUnit   = nuevoPrecio;
  h.ingreso      = (nuevoPago === 'regalo' || nuevoPago === 'anota') ? 0 : nuevoPrecio * nuevaCant;
  h._stock       = nuevo_stock;
  h.moneda       = document.querySelector('input[name="editar-moneda"]:checked')?.value || 'ARS';
  if (nuevoPago === 'anota') h.nombreAnota = nuevoNombreAnota;
  else delete h.nombreAnota;

  guardar();
  renderTodo();
  modalEditar.classList.add('hidden');
  // Reabrir historial si venía de ahí
  if (editandoDesdeHistorial) abrirHistorial();
});

document.getElementById('btn-cancelar-editar').addEventListener('click', () => {
  modalEditar.classList.add('hidden');
});

// ── Eliminar registro ─────────────────────────────────────────────────────────
window.eliminarRegistro = function(id) {
  const idx = historial.findIndex(x => x.id === id);
  if (idx === -1) return;
  const h = historial[idx];
  if (!confirm(`¿Eliminar este registro y devolver el stock?\n\n${h.descripcion} (${h.cantidad} u.)`)) return;

  const ref = h._stock || inferirStock(h);
  if (ref) {
    const { tipo, talle, variante, modelo } = ref;
    if (tipo === 'adulto') estado.adultos[talle][variante] += h.cantidad;
    else if (tipo === 'nino') estado.ninos[talle] = (estado.ninos[talle] ?? 0) + h.cantidad;
    else if (tipo === 'tote') estado.totes[modelo] += h.cantidad;
  }

  historial.splice(idx, 1);
  guardar();
  renderTodo();
  abrirHistorial();
};

// ── Tab Auditoría ─────────────────────────────────────────────────────────────
function renderAuditoria() {
  const contenedor = document.getElementById('auditoria-contenido');

  // Adultos — filas = diseño+color, columnas = talle
  const filasAdultos = GRUPOS_ADULTO.map(grupo =>
    grupo.variantes.map((v, idx) => {
      const color = COLOR_VARIANTE[v];
      const celdaGrupo = idx === 0
        ? `<td class="grupo-label" rowspan="${grupo.variantes.length}">${grupo.nombre}</td>`
        : '';
      return `<tr>
        ${celdaGrupo}
        <td class="color-label color-${color.toLowerCase()}">${color}</td>
        ${TALLES_ADULTO.map(talle => {
          const val = estado.adultos[talle][v];
          return `<td><div class="audit-cell">
            <span class="audit-actual">${val}</span>
            <input type="number" class="audit-input" min="0"
              data-tipo="adulto" data-talle="${talle}" data-variante="${v}"
              data-sistema="${val}" placeholder="—" />
          </div></td>`;
        }).join('')}
      </tr>`;
    }).join('')
  ).join('');

  // Totes
  const filaToteReposera = `<tr>
    <td>Reposera</td>
    <td>
      <div class="audit-cell">
        <span class="audit-actual">${estado.totes.silla}</span>
        <input type="number" class="audit-input" min="0"
          data-tipo="tote" data-modelo="silla"
          data-sistema="${estado.totes.silla}" placeholder="—" />
      </div>
    </td>
  </tr>`;
  const filaToteVereda = `<tr>
    <td>Vereda</td>
    <td>
      <div class="audit-cell">
        <span class="audit-actual">${estado.totes.vereda}</span>
        <input type="number" class="audit-input" min="0"
          data-tipo="tote" data-modelo="vereda"
          data-sistema="${estado.totes.vereda}" placeholder="—" />
      </div>
    </td>
  </tr>`;

  // Niños
  const filasNinos = TALLES_NINO.map(t => {
    const v = estado.ninos[t] ?? 0;
    return `<tr>
      <td class="talle-label">${t}</td>
      <td>
        <div class="audit-cell">
          <span class="audit-actual">${v}</span>
          <input type="number" class="audit-input" min="0"
            data-tipo="nino" data-talle="${t}"
            data-sistema="${v}" placeholder="—" />
        </div>
      </td>
    </tr>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="audit-leyenda">
      <span class="audit-leyenda-item">🙈 Los valores del sistema están ocultos. Ingresá la cantidad física de cada ítem. Dejá en blanco lo que no contaste.</span>
    </div>

    <div class="seccion">
      <h2>Remeras Adulto</h2>
      <div class="tabla-container">
        <table>
          <thead>
            <tr>
              <th>Diseño</th>
              <th>Color</th>
              ${TALLES_ADULTO.map(t => `<th>${t}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${filasAdultos}</tbody>
        </table>
      </div>
    </div>

    <div class="seccion">
      <h2>Tote Bags</h2>
      <div class="tabla-container">
        <table>
          <thead><tr><th>Modelo</th><th>Cantidad</th></tr></thead>
          <tbody>${filaToteReposera}${filaToteVereda}</tbody>
        </table>
      </div>
    </div>

    <div class="seccion">
      <h2>Remeras Niñx — Reposera Roja</h2>
      <div class="tabla-container">
        <table>
          <thead><tr><th>Talle</th><th>Cantidad</th></tr></thead>
          <tbody>${filasNinos}</tbody>
        </table>
      </div>
    </div>
  `;

  // Activar modo ciego por defecto al renderizar
  const checkbox = document.getElementById('audit-modo-ciego');
  if (checkbox) {
    checkbox.checked = true;
    document.querySelectorAll('.audit-actual').forEach(el => {
      el.style.visibility = 'hidden';
    });
  }
}

document.getElementById('btn-guardar-auditoria').addEventListener('click', () => {
  const ajustes       = [];
  const coincidencias = [];
  const sinContar     = [];

  document.querySelectorAll('.audit-input').forEach(input => {
    const val      = input.value.trim();
    const tipo     = input.dataset.tipo;
    const talle    = input.dataset.talle;
    const variante = input.dataset.variante;
    const modelo   = input.dataset.modelo;

    let desc   = '';
    let actual = 0;
    if (tipo === 'adulto') {
      desc   = `${LABEL_VARIANTE[variante]} talle ${talle}`;
      actual = estado.adultos[talle][variante];
    } else if (tipo === 'tote') {
      desc   = `Tote Bag ${modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
      actual = estado.totes[modelo];
    } else if (tipo === 'nino') {
      desc   = `Remera Niñx talle ${talle}`;
      actual = estado.ninos[talle] ?? 0;
    }

    if (val === '') {
      sinContar.push({ desc, valor: actual });
      return;
    }

    const fisico = parseInt(val, 10);
    if (isNaN(fisico) || fisico < 0) {
      sinContar.push({ desc, valor: actual });
      return;
    }

    if (fisico !== actual) {
      ajustes.push({ tipo, talle, variante, modelo, desc, anterior: actual, nuevo: fisico, diff: fisico - actual });
    } else {
      coincidencias.push({ desc, valor: actual });
    }
  });

  // No se ingresó nada
  if (ajustes.length === 0 && coincidencias.length === 0) {
    alert('No ingresaste ningún valor. Completá los campos con el conteo físico.');
    return;
  }

  // Validación: saldo neto por categoría debe ser 0
  const netoAdulto = ajustes.filter(a => a.tipo === 'adulto').reduce((s, a) => s + a.diff, 0);
  const netoTote   = ajustes.filter(a => a.tipo === 'tote').reduce((s, a) => s + a.diff, 0);
  const netoNino   = ajustes.filter(a => a.tipo === 'nino').reduce((s, a) => s + a.diff, 0);

  if (netoAdulto !== 0 || netoTote !== 0 || netoNino !== 0) {
    const fmtNeto = n => {
      if (n === 0) return '<span class="audit-net-ok">✅ 0</span>';
      const s = n > 0 ? `+${n}` : String(n);
      return `<span class="${n < 0 ? 'audit-net-neg' : 'audit-net-pos'}">${s} u.</span>`;
    };
    document.getElementById('audit-bloqueo-netos').innerHTML = `
      <div class="audit-bloqueo-fila"><span>👕 Remeras adultos</span>${fmtNeto(netoAdulto)}</div>
      <div class="audit-bloqueo-fila"><span>👜 Tote Bags</span>${fmtNeto(netoTote)}</div>
      <div class="audit-bloqueo-fila"><span>👶 Remeras niñxs</span>${fmtNeto(netoNino)}</div>
    `;
    // Guardamos la comparación por si vuelven a editar
    auditComparacion = { ajustes, coincidencias, sinContar, diferenciaNeta: netoAdulto + netoTote + netoNino };
    document.getElementById('modal-audit-bloqueo').classList.remove('hidden');
    return;
  }

  mostrarResultadoAuditoria({ ajustes, coincidencias, sinContar, diferenciaNeta: 0 });
});

function aplicarAjustesAuditoria(motivo, motivoDetalle) {
  const { ajustes, diferenciaNeta } = auditComparacion;

  ajustes.forEach(aj => {
    if (aj.tipo === 'adulto')    estado.adultos[aj.talle][aj.variante] = aj.nuevo;
    else if (aj.tipo === 'tote') estado.totes[aj.modelo]               = aj.nuevo;
    else if (aj.tipo === 'nino') estado.ninos[aj.talle]                = aj.nuevo;
  });

  // Snapshot del stock verificado (después de aplicar ajustes)
  const stockSnapshot = {
    adultos: JSON.parse(JSON.stringify(estado.adultos)),
    totes:   JSON.parse(JSON.stringify(estado.totes)),
    ninos:   JSON.parse(JSON.stringify(estado.ninos)),
  };

  const entrada = {
    id:            Date.now(),
    fecha:         new Date().toLocaleString('es-AR'),
    ajustes:       ajustes.map(a => ({ desc: a.desc, anterior: a.anterior, nuevo: a.nuevo, diff: a.diff })),
    diferenciaNeta,
    motivo:        motivo || null,
    motivoDetalle: motivoDetalle || '',
    stockSnapshot,
  };

  auditorias.push(entrada);
  localStorage.setItem('cayo_auditorias', JSON.stringify(auditorias));
  auditComparacion = null;

  guardar();
  renderTodo();
  renderAuditoria();
  renderHistorialAuditorias();

  // Banner de confirmación
  const banner = document.createElement('div');
  banner.className = 'audit-guardado-banner';
  const motivoTxt = motivo ? ` · ${motivo}` : '';
  banner.textContent = ajustes.length > 0
    ? `✅ Auditoría guardada — ${ajustes.length} ajuste${ajustes.length !== 1 ? 's' : ''}${motivoTxt}`
    : `✅ Auditoría guardada — sin diferencias`;
  document.querySelector('.audit-historial-section').prepend(banner);
  setTimeout(() => banner.remove(), 4000);
}

// ── Historial de auditorías ───────────────────────────────────────────────────
function renderHistorialAuditorias() {
  const lista = document.getElementById('audit-historial-lista');
  if (!lista) return;

  if (auditorias.length === 0) {
    lista.innerHTML = '<p class="historial-vacio" style="padding:1rem 0">Todavía no hay auditorías registradas.</p>';
    return;
  }

  lista.innerHTML = [...auditorias].reverse().map(a => {
    const neto   = a.diferenciaNeta;
    const signo  = neto > 0 ? '+' : '';
    const cls    = neto < 0 ? 'audit-net-neg' : neto > 0 ? 'audit-net-pos' : 'audit-net-ok';
    const netLbl = neto === 0 ? '✅ Neto 0' : `${signo}${neto} u.`;
    const motivoHtml  = a.motivo ? `<span class="audit-motivo-badge">${a.motivo}</span>` : '';
    const detalleHtml = a.motivoDetalle
      ? `<div class="audit-detalle-txt">💬 "${a.motivoDetalle}"</div>` : '';

    const ajustesHtml = a.ajustes.length === 0
      ? `<div class="audit-aj-fila" style="font-style:italic">
          <span class="audit-aj-desc" style="color:var(--texto-tenue)">Sin diferencias — todo lo contado coincidió</span>
          <span></span><span></span>
        </div>`
      : a.ajustes.map(aj => {
          const d    = aj.diff > 0 ? `+${aj.diff}` : String(aj.diff);
          const dcls = aj.diff < 0 ? 'audit-aj-neg' : 'audit-aj-pos';
          return `<div class="audit-aj-fila">
            <span class="audit-aj-desc">${aj.desc}</span>
            <span class="audit-aj-vals">${aj.anterior} → ${aj.nuevo}</span>
            <span class="audit-aj-diff ${dcls}">${d}</span>
          </div>`;
        }).join('');

    // Snapshot del stock en esa auditoría
    let snapshotHtml = '';
    if (a.stockSnapshot) {
      const ss = a.stockSnapshot;
      // Adultos: total + desglose por variante
      const totAdulto = TALLES_ADULTO.reduce((s, t) =>
        s + Object.values(ss.adultos[t] || {}).reduce((a, b) => a + b, 0), 0);
      const adultRows = GRUPOS_ADULTO.flatMap(g => g.variantes).map(v => {
        const tot = TALLES_ADULTO.reduce((s, t) => s + (ss.adultos[t]?.[v] ?? 0), 0);
        if (tot === 0) return '';
        const talleDetalle = TALLES_ADULTO.map(t => {
          const q = ss.adultos[t]?.[v] ?? 0;
          return q > 0 ? `${t}:${q}` : '';
        }).filter(Boolean).join(' ');
        return `<span class="snap-item"><strong>${LABEL_VARIANTE[v]}</strong> ${tot} (${talleDetalle})</span>`;
      }).filter(Boolean).join('');

      // Totes
      const totTotes = (ss.totes.silla || 0) + (ss.totes.vereda || 0);
      const totesRow = totTotes > 0
        ? `<span class="snap-item">Reposera: ${ss.totes.silla || 0}</span><span class="snap-item">Vereda: ${ss.totes.vereda || 0}</span>`
        : '<span class="snap-item snap-cero">sin stock</span>';

      // Niñxs
      const ninoEntries = Object.entries(ss.ninos || {}).filter(([,q]) => q > 0);
      const ninosRow = ninoEntries.length > 0
        ? ninoEntries.map(([t, q]) => `<span class="snap-item">T${t}:${q}</span>`).join('')
        : '<span class="snap-item snap-cero">sin stock</span>';

      snapshotHtml = `
        <div class="audit-snapshot">
          <div class="audit-snapshot-titulo">📦 Stock verificado en esta auditoría</div>
          <div class="audit-snapshot-fila">
            <span class="snap-cat">👕 Adultos (${totAdulto} u.)</span>
            <div class="snap-items">${adultRows || '<span class="snap-cero">sin stock</span>'}</div>
          </div>
          <div class="audit-snapshot-fila">
            <span class="snap-cat">👜 Totes (${totTotes} u.)</span>
            <div class="snap-items">${totesRow}</div>
          </div>
          <div class="audit-snapshot-fila">
            <span class="snap-cat">👶 Niñxs (${ninoEntries.reduce((s,[,q])=>s+q,0)} u.)</span>
            <div class="snap-items">${ninosRow}</div>
          </div>
        </div>`;
    }

    return `<div class="audit-hist-item" data-id="${a.id}">
      <div class="audit-hist-header" onclick="toggleAuditItem(${a.id})">
        <div class="audit-hist-meta">
          <span class="audit-hist-fecha">${a.fecha}</span>
          <span class="audit-hist-count">${a.ajustes.length} ajuste${a.ajustes.length !== 1 ? 's' : ''}</span>
          <span class="audit-net ${cls}">${netLbl}</span>
          ${motivoHtml}
        </div>
        <div class="audit-hist-acciones">
          <button class="btn-audit-pdf" onclick="event.stopPropagation();descargarAuditoriaPDF(${a.id})" title="Descargar PDF">📄 PDF</button>
          <span class="audit-toggle-icon">▼</span>
        </div>
      </div>
      <div class="audit-hist-detalle audit-collapsed">
        ${ajustesHtml}
        ${detalleHtml}
        ${snapshotHtml}
      </div>
    </div>`;
  }).join('');
}

window.toggleAuditItem = function(id) {
  const item = document.querySelector(`.audit-hist-item[data-id="${id}"]`);
  if (!item) return;
  const det  = item.querySelector('.audit-hist-detalle');
  const ico  = item.querySelector('.audit-toggle-icon');
  const open = det.classList.toggle('audit-collapsed');
  ico.textContent = open ? '▼' : '▲';
};

// ── Modal resultado auditoría ─────────────────────────────────────────────────
function mostrarResultadoAuditoria(comparacion) {
  auditComparacion = comparacion;
  const { ajustes, coincidencias, sinContar, diferenciaNeta } = comparacion;

  let html = '';

  if (ajustes.length > 0) {
    html += `<div class="resultado-seccion">
      <h3 class="resultado-titulo resultado-titulo--diff">🔴 Diferencias (${ajustes.length})</h3>
      ${ajustes.map(a => {
        const d    = a.diff > 0 ? `+${a.diff}` : String(a.diff);
        const dcls = a.diff < 0 ? 'audit-aj-neg' : 'audit-aj-pos';
        return `<div class="audit-aj-fila">
          <span class="audit-aj-desc">${a.desc}</span>
          <span class="audit-aj-vals">${a.anterior} → ${a.nuevo}</span>
          <span class="audit-aj-diff ${dcls}">${d}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  if (coincidencias.length > 0) {
    html += `<div class="resultado-seccion">
      <h3 class="resultado-titulo resultado-titulo--ok">✅ Coincidencias (${coincidencias.length})</h3>
      ${coincidencias.map(c => `<div class="audit-aj-fila">
        <span class="audit-aj-desc">${c.desc}</span>
        <span class="audit-aj-vals">${c.valor} u. — ok</span>
        <span></span>
      </div>`).join('')}
    </div>`;
  }

  if (sinContar.length > 0) {
    html += `<div class="resultado-seccion">
      <h3 class="resultado-titulo resultado-titulo--sc">⚪ Sin contar (${sinContar.length})</h3>
      ${sinContar.map(s => `<div class="audit-aj-fila">
        <span class="audit-aj-desc">${s.desc}</span>
        <span class="audit-aj-vals" style="color:var(--texto-tenue);font-style:italic">no contado</span>
        <span></span>
      </div>`).join('')}
    </div>`;
  }

  if (ajustes.length === 0) {
    html = `<p class="resultado-ok-msg">✅ Todo lo contado coincide con el sistema.</p>` + html;
  }

  if (diferenciaNeta !== 0) {
    const signo = diferenciaNeta > 0 ? '+' : '';
    const cls   = diferenciaNeta < 0 ? 'audit-net-neg' : 'audit-net-pos';
    html += `<div class="resultado-neto">
      Diferencia neta: <strong class="${cls}">${signo}${diferenciaNeta} u.</strong>
    </div>`;
  } else if (ajustes.length > 0) {
    html += `<div class="resultado-neto resultado-neto--ok">
      Diferencia neta: <strong>0 u.</strong> — redistribución interna ✅
    </div>`;
  }

  document.getElementById('resultado-body').innerHTML = html;

  const motivoSection = document.getElementById('resultado-motivo-section');
  if (diferenciaNeta !== 0) {
    motivoSection.classList.remove('hidden');
    document.getElementById('resultado-motivo-select').value = '';
    document.getElementById('resultado-detalle-label').style.display = 'none';
    document.getElementById('resultado-detalle').value = '';
    document.getElementById('resultado-error').classList.add('hidden');
  } else {
    motivoSection.classList.add('hidden');
  }

  document.getElementById('modal-resultado-auditoria').classList.remove('hidden');
}

document.getElementById('resultado-motivo-select').addEventListener('change', () => {
  document.getElementById('resultado-detalle-label').style.display =
    document.getElementById('resultado-motivo-select').value ? 'flex' : 'none';
  document.getElementById('resultado-error').classList.add('hidden');
});

document.getElementById('btn-confirmar-resultado').addEventListener('click', () => {
  if (!auditComparacion) return;
  if (auditComparacion.diferenciaNeta !== 0) {
    const motivo = document.getElementById('resultado-motivo-select').value;
    if (!motivo) { document.getElementById('resultado-error').classList.remove('hidden'); return; }
    const detalle = document.getElementById('resultado-detalle').value.trim();
    document.getElementById('modal-resultado-auditoria').classList.add('hidden');
    aplicarAjustesAuditoria(motivo, detalle);
  } else {
    document.getElementById('modal-resultado-auditoria').classList.add('hidden');
    aplicarAjustesAuditoria(null, '');
  }
});

['btn-cancelar-resultado', 'btn-cerrar-resultado'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modal-resultado-auditoria').classList.add('hidden');
    auditComparacion = null;
  });
});

// ── Modal bloqueo auditoría ───────────────────────────────────────────────────
['btn-cerrar-audit-bloqueo', 'btn-bloqueo-editar'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modal-audit-bloqueo').classList.add('hidden');
    auditComparacion = null;
  });
});

document.getElementById('btn-bloqueo-ventas').addEventListener('click', () => {
  document.getElementById('modal-audit-bloqueo').classList.add('hidden');
  auditComparacion = null;
  irATab('ventas');
});

document.getElementById('modal-resultado-auditoria').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-resultado-auditoria')) {
    document.getElementById('modal-resultado-auditoria').classList.add('hidden');
    auditComparacion = null;
  }
});

// Modo ciego — oculta/muestra los valores del sistema
document.getElementById('audit-modo-ciego').addEventListener('change', function() {
  document.querySelectorAll('.audit-actual').forEach(el => {
    el.style.visibility = this.checked ? 'hidden' : '';
  });
});

// ── Tab Pedidos ───────────────────────────────────────────────────────────────
let pedidosSubtab = 'activos';

function renderPedidos() {
  const contenedor = document.getElementById('pedidos-contenido');
  if (!contenedor) return;

  // ── Saldo pendiente summary ──
  const conSaldo = pedidos.filter(p => p.estadoFisico !== 'cancelado' && pedidoSaldo(p) > 0);
  const totalSaldo = conSaldo.reduce((s, p) => s + pedidoSaldo(p), 0);
  const saldoEl = document.getElementById('pedidos-saldo-summary');

  if (conSaldo.length > 0) {
    const porPersona = {};
    conSaldo.forEach(p => { porPersona[p.para] = (porPersona[p.para] || 0) + pedidoSaldo(p); });
    saldoEl.innerHTML = `
      <div class="saldo-total-row">
        <span>💳 Saldo adeudado</span>
        <strong>${formatPeso(totalSaldo)}</strong>
      </div>
      <div class="saldo-personas">
        ${Object.entries(porPersona).map(([n, s]) =>
          `<div class="saldo-persona-row"><span>${n}</span><span>${formatPeso(s)}</span></div>`
        ).join('')}
      </div>`;
    saldoEl.classList.remove('hidden');
  } else {
    saldoEl.innerHTML = '';
    saldoEl.classList.add('hidden');
  }

  // ── Filtrar por subtab ──
  let filtrados;
  if (pedidosSubtab === 'activos') {
    filtrados = pedidos.filter(p => p.estadoFisico === 'solicitud' || p.estadoFisico === 'armado');
  } else if (pedidosSubtab === 'entregados') {
    filtrados = pedidos.filter(p => p.estadoFisico === 'entregado');
  } else {
    filtrados = pedidos.filter(p => p.estadoFisico === 'cancelado');
  }

  if (filtrados.length === 0) {
    contenedor.innerHTML = '<p class="historial-vacio" style="padding:2rem 0">No hay pedidos en esta sección.</p>';
    return;
  }

  if (pedidosSubtab === 'activos') {
    const solicitudes = filtrados.filter(p => p.estadoFisico === 'solicitud');
    const armados     = filtrados.filter(p => p.estadoFisico === 'armado');
    let html = '';
    if (solicitudes.length > 0) {
      html += `<div class="pedidos-grupo">
        <h3 class="pedidos-grupo-titulo pedidos-grupo--sol">📝 Solicitudes (${solicitudes.length})</h3>
        ${solicitudes.map(p => renderPedidoCard(p)).join('')}
      </div>`;
    }
    if (armados.length > 0) {
      html += `<div class="pedidos-grupo">
        <h3 class="pedidos-grupo-titulo pedidos-grupo--arm">📦 Armados — listos para entregar (${armados.length})</h3>
        ${armados.map(p => renderPedidoCard(p)).join('')}
      </div>`;
    }
    contenedor.innerHTML = html;
  } else {
    contenedor.innerHTML = filtrados.map(p => renderPedidoCard(p)).join('');
  }
}

function renderPedidoCard(p) {
  const pagado = pedidoTotalPagado(p);
  const saldo  = pedidoSaldo(p);
  const epago  = pedidoEstadoPago(p);

  const pagoBadge = {
    sin_pago: '<span class="pedido-pago-badge pago-sin">Sin pago</span>',
    parcial:  '<span class="pedido-pago-badge pago-parcial">Seña parcial</span>',
    pagado:   '<span class="pedido-pago-badge pago-ok">✅ Pagado</span>',
  }[epago] || '';

  const monedaBadgePed = p.moneda === 'ARS'
    ? '<span class="moneda-badge moneda-ars">ARS</span>'
    : '<span class="moneda-badge moneda-uyu">UYU</span>';

  const estadoBadge = {
    solicitud: '<span class="pedido-estado-badge est-solicitud">Solicitud</span>',
    armado:    '<span class="pedido-estado-badge est-armado">📦 Armado</span>',
    entregado: '<span class="pedido-estado-badge est-entregado">🚚 Entregado</span>',
    cancelado: '<span class="pedido-estado-badge est-cancelado">✕ Cancelado</span>',
  }[p.estadoFisico] || '';

  let stockWarn = '';
  if (p.estadoFisico === 'solicitud') {
    const warns = (p.items || [])
      .filter(it => stockDisponible(it.tipo, it) < it.cantidad)
      .map(it => `${_itemDesc(it)}: ${stockDisponible(it.tipo, it)} disp.`);
    if (warns.length > 0) {
      stockWarn = `<div class="pedido-stock-warn">⚠️ Stock insuficiente — ${warns.join(', ')}</div>`;
    }
  }

  const precioHtml = `
    <div class="pedido-pagos-resumen">
      <span class="pp-total">Total: <strong>${formatPeso(p.precioTotal || 0)}</strong></span>
      ${pagado > 0 ? `<span class="pp-cobrado">Cobrado: ${formatPeso(pagado)}</span>` : ''}
      ${saldo > 0  ? `<span class="pp-saldo">Debe: <strong>${formatPeso(saldo)}</strong></span>` : ''}
    </div>`;

  const pagosHistHtml = (p.pagos || []).length > 0
    ? `<div class="pedido-pagos-hist">
        ${p.pagos.map(pg => `<div class="pago-hist-fila">
          <span class="pago-hist-fecha">${pg.fecha}</span>
          <span class="pago-hist-monto">${pg.metodo === 'efectivo' ? '💵' : '📲'} ${formatPeso(pg.monto)}</span>
        </div>`).join('')}
      </div>` : '';

  let acciones = '';
  if (p.estadoFisico === 'solicitud') {
    acciones = `
      <button class="btn-pedido btn-armar"   onclick="armarPedido(${p.id})">📦 Armar</button>
      ${saldo > 0 ? `<button class="btn-pedido btn-pago"    onclick="abrirPagoPedido(${p.id})">💰 Cobrar</button>` : ''}
      <button class="btn-pedido btn-cancel-p" onclick="cancelarPedido(${p.id})">✕</button>`;
  } else if (p.estadoFisico === 'armado') {
    acciones = `
      <button class="btn-pedido btn-entregar" onclick="entregarPedido(${p.id})">🚚 Entregar</button>
      ${saldo > 0 ? `<button class="btn-pedido btn-pago"    onclick="abrirPagoPedido(${p.id})">💰 Cobrar</button>` : ''}
      <button class="btn-pedido btn-cancel-p" onclick="cancelarPedido(${p.id})">✕</button>`;
  } else if (p.estadoFisico === 'entregado' && saldo > 0) {
    acciones = `<button class="btn-pedido btn-pago" onclick="abrirPagoPedido(${p.id})">💰 Cobrar saldo</button>`;
  }

  return `<div class="pedido-card pedido-estado-${p.estadoFisico}">
    <div class="pedido-card-top">
      <div class="pedido-card-quien">
        <span class="pedido-para">${p.para}</span>
        <span class="pedido-item-desc">${pedidoDescItem(p)}</span>
      </div>
      <div class="pedido-card-badges">${estadoBadge}${pagoBadge}${monedaBadgePed}</div>
    </div>
    ${stockWarn}
    ${p.notas ? `<div class="pedido-notas">💬 ${p.notas}</div>` : ''}
    ${precioHtml}
    ${pagosHistHtml}
    ${acciones ? `<div class="pedido-acciones">${acciones}</div>` : ''}
    <div class="pedido-fecha-meta">${p.fecha}${p.fechaEntrega ? ` · Entregado: ${p.fechaEntrega}` : ''}</div>
  </div>`;
}

// Sub-tabs de pedidos
document.querySelectorAll('.pedidos-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pedidos-subtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pedidosSubtab = btn.dataset.estado;
    renderPedidos();
  });
});

// ── Acciones de pedidos ───────────────────────────────────────────────────────
window.armarPedido = function(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p || p.estadoFisico !== 'solicitud') return;
  const items = p.items || [];
  const faltantes = items.filter(it => stockDisponible(it.tipo, it) < it.cantidad);
  if (faltantes.length > 0) {
    const msg = faltantes.map(it => `${_itemDesc(it)}: disponible ${stockDisponible(it.tipo, it)}`).join('\n');
    if (!confirm(`⚠️ Stock insuficiente:\n${msg}\n\n¿Marcar como armado de todas formas?`)) return;
  }
  p.estadoFisico = 'armado';
  guardarPedidos();
  renderTodo();
  renderPedidos();
  pushToCloud();
};

window.entregarPedido = function(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p || p.estadoFisico !== 'armado') return;
  if (!confirm(`¿Marcar como entregado a ${p.para}?\nEsto descuenta el stock permanentemente.`)) return;
  (p.items || []).forEach(it => {
    if (it.tipo === 'adulto' && estado.adultos[it.talle]) {
      estado.adultos[it.talle][it.variante] = Math.max(0, (estado.adultos[it.talle][it.variante] || 0) - it.cantidad);
    } else if (it.tipo === 'tote') {
      estado.totes[it.modelo] = Math.max(0, (estado.totes[it.modelo] || 0) - it.cantidad);
    } else if (it.tipo === 'nino') {
      estado.ninos[it.talle] = Math.max(0, (estado.ninos[it.talle] ?? 0) - it.cantidad);
    }
  });
  p.estadoFisico = 'entregado';
  p.fechaEntrega = new Date().toLocaleString('es-AR');
  guardarPedidos();
  guardar();
  renderTodo();
  renderPedidos();
  pushToCloud();
};

window.cancelarPedido = function(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Cancelar el pedido de ${p.para}?`)) return;
  p.estadoFisico = 'cancelado';
  guardarPedidos();
  renderTodo();
  renderPedidos();
  pushToCloud();
};

window.abrirPagoPedido = function(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  pedidoPagoActualId = id;
  const pagado = pedidoTotalPagado(p);
  const saldo  = pedidoSaldo(p);
  document.getElementById('pago-pedido-info').innerHTML =
    `<strong>${p.para}</strong><br>${pedidoDescItem(p)}<br>
     Total: ${formatPeso(p.precioTotal || 0)} &nbsp;·&nbsp;
     Cobrado: ${formatPeso(pagado)} &nbsp;·&nbsp;
     <strong>Saldo: ${formatPeso(saldo)}</strong>`;
  document.getElementById('pago-pedido-monto').value = saldo > 0 ? saldo : '';
  document.getElementById('pago-pedido-metodo').value = 'efectivo';
  document.getElementById('pago-pedido-error').classList.add('hidden');
  document.getElementById('modal-pago-pedido').classList.remove('hidden');
};

document.getElementById('btn-confirmar-pago-pedido').addEventListener('click', () => {
  const p = pedidos.find(x => x.id === pedidoPagoActualId);
  if (!p) return;
  const monto  = parseFloat(document.getElementById('pago-pedido-monto').value);
  const metodo = document.getElementById('pago-pedido-metodo').value;
  if (!monto || monto <= 0) {
    document.getElementById('pago-pedido-error').classList.remove('hidden');
    return;
  }
  p.pagos = p.pagos || [];
  p.pagos.push({ id: Date.now(), fecha: new Date().toLocaleString('es-AR'), monto, metodo });
  pedidoPagoActualId = null;
  document.getElementById('modal-pago-pedido').classList.add('hidden');
  guardarPedidos();
  renderPedidos();
  renderRecaudado();
  pushToCloud();
});

['btn-cancelar-pago-pedido', 'btn-cerrar-pago-pedido'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modal-pago-pedido').classList.add('hidden');
    pedidoPagoActualId = null;
  });
});

// ── Modal Nueva Solicitud ─────────────────────────────────────────────────────
document.getElementById('btn-nueva-solicitud').addEventListener('click', () => {
  solItemsTemp = [];
  renderSolItemsChips();
  document.getElementById('sol-para').value      = '';
  document.getElementById('sol-categoria').value = '';
  document.getElementById('sol-cantidad').value  = 1;
  document.getElementById('sol-precio').value    = '';
  document.getElementById('sol-precio').dataset.autoset = 'true';
  document.getElementById('sol-notas').value     = '';
  document.getElementById('sol-error').classList.add('hidden');
  document.getElementById('sol-stock-info').innerHTML = '';
  ['sol-campos-adulto','sol-campos-nino','sol-campos-tote'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  const uyuRadio = document.querySelector('input[name="moneda-sol"][value="UYU"]');
  if (uyuRadio) uyuRadio.checked = true;
  document.getElementById('modal-solicitud').classList.remove('hidden');
  setTimeout(() => document.getElementById('sol-para').focus(), 80);
});

function actualizarStockInfoSolicitud() {
  const cat    = document.getElementById('sol-categoria').value;
  const infoEl = document.getElementById('sol-stock-info');
  if (!cat) { infoEl.innerHTML = ''; recalcSolPrecio(); return; }
  let tipo, opts;
  if (cat === 'adulto') {
    tipo = 'adulto';
    opts = { talle: document.getElementById('sol-talle-adulto').value, variante: document.getElementById('sol-variante').value };
  } else if (cat === 'nino') {
    tipo = 'nino';
    opts = { talle: document.getElementById('sol-talle-nino').value };
  } else {
    tipo = 'tote';
    opts = { modelo: document.getElementById('sol-modelo').value };
  }
  const cant = parseInt(document.getElementById('sol-cantidad').value, 10) || 1;
  const disp = stockDisponible(tipo, opts);
  const arm  = countArmados(tipo, opts);
  const sol  = countSolicitudes(tipo, opts);
  const raw  = getRawStock(tipo, opts);
  const ok   = disp >= cant;
  infoEl.innerHTML = `
    <div class="sol-stock-grid">
      <div class="sol-stock-item${ok ? '' : ' sol-stock-warn-item'}">
        <span>Disponible</span>
        <strong style="color:${ok ? 'var(--verde)' : 'var(--acento)'}">${disp}</strong>
      </div>
      ${arm > 0 ? `<div class="sol-stock-item"><span>Armados</span><strong>${arm}</strong></div>` : ''}
      ${sol > 0 ? `<div class="sol-stock-item"><span>En solicitudes</span><strong>${sol}</strong></div>` : ''}
      <div class="sol-stock-item"><span>Total depósito</span><strong>${raw}</strong></div>
    </div>
    ${!ok ? `<div class="sol-warn-msg">⚠️ Stock insuficiente. Podés agregar igual.</div>` : ''}
  `;
  recalcSolPrecio();
}

document.getElementById('sol-categoria').addEventListener('change', () => {
  const cat = document.getElementById('sol-categoria').value;
  ['sol-campos-adulto','sol-campos-nino','sol-campos-tote'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  if (cat === 'adulto')      document.getElementById('sol-campos-adulto').classList.remove('hidden');
  else if (cat === 'nino')   document.getElementById('sol-campos-nino').classList.remove('hidden');
  else if (cat === 'tote')   document.getElementById('sol-campos-tote').classList.remove('hidden');
  actualizarStockInfoSolicitud();
});

['sol-talle-adulto','sol-variante','sol-talle-nino','sol-modelo'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', actualizarStockInfoSolicitud);
});
document.getElementById('sol-cantidad').addEventListener('input', () => {
  document.getElementById('sol-precio').dataset.autoset = 'true';
  actualizarStockInfoSolicitud();
});
document.getElementById('sol-precio').addEventListener('input', () => {
  document.getElementById('sol-precio').dataset.autoset = 'false';
});

document.getElementById('btn-agregar-item-sol').addEventListener('click', () => {
  const cat   = document.getElementById('sol-categoria').value;
  const errEl = document.getElementById('sol-error');
  if (!cat) {
    errEl.textContent = 'Seleccioná una categoría para el ítem.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  const cant = parseInt(document.getElementById('sol-cantidad').value, 10) || 1;
  const item = { tipo: cat, cantidad: cant };
  if (cat === 'adulto') {
    item.talle    = document.getElementById('sol-talle-adulto').value;
    item.variante = document.getElementById('sol-variante').value;
  } else if (cat === 'nino') {
    item.talle = document.getElementById('sol-talle-nino').value;
  } else {
    item.modelo = document.getElementById('sol-modelo').value;
  }
  solItemsTemp.push(item);
  renderSolItemsChips();
  document.getElementById('sol-categoria').value = '';
  ['sol-campos-adulto','sol-campos-nino','sol-campos-tote'].forEach(id =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('sol-cantidad').value = 1;
  document.getElementById('sol-stock-info').innerHTML = '';
  recalcSolPrecio();
});

document.querySelectorAll('input[name="moneda-sol"]').forEach(r =>
  r.addEventListener('change', () => {
    document.getElementById('sol-precio').dataset.autoset = 'true';
    recalcSolPrecio();
  })
);

document.getElementById('btn-confirmar-solicitud').addEventListener('click', () => {
  const para   = document.getElementById('sol-para').value.trim();
  const precio = parseFloat(document.getElementById('sol-precio').value);
  const notas  = document.getElementById('sol-notas').value.trim();
  const errEl  = document.getElementById('sol-error');

  if (!para) { errEl.textContent = 'Ingresá el nombre.'; errEl.classList.remove('hidden'); return; }

  const cat  = document.getElementById('sol-categoria').value;
  const allItems = [...solItemsTemp];
  if (cat) {
    const cant = parseInt(document.getElementById('sol-cantidad').value, 10) || 1;
    const item = { tipo: cat, cantidad: cant };
    if (cat === 'adulto') {
      item.talle    = document.getElementById('sol-talle-adulto').value;
      item.variante = document.getElementById('sol-variante').value;
    } else if (cat === 'nino') {
      item.talle = document.getElementById('sol-talle-nino').value;
    } else {
      item.modelo = document.getElementById('sol-modelo').value;
    }
    allItems.push(item);
  }

  if (allItems.length === 0) {
    errEl.textContent = 'Agregá al menos un ítem a la solicitud.';
    errEl.classList.remove('hidden');
    return;
  }
  if (isNaN(precio) || precio < 0) {
    errEl.textContent = 'Ingresá un precio válido.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const monedaSol = document.querySelector('input[name="moneda-sol"]:checked')?.value || 'UYU';
  const pedido = {
    id:           Date.now(),
    fecha:        new Date().toLocaleString('es-AR'),
    para,
    items:        allItems,
    precioTotal:  precio,
    moneda:       monedaSol,
    estadoFisico: 'solicitud',
    pagos:        [],
    notas,
  };

  pedidos.push(pedido);
  guardarPedidos();
  solItemsTemp = [];
  document.getElementById('modal-solicitud').classList.add('hidden');
  renderTodo();
  renderPedidos();
  pushToCloud();
});

['btn-cancelar-solicitud','btn-cerrar-solicitud'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modal-solicitud').classList.add('hidden');
  });
});

// ── Modal Configuración Sync ──────────────────────────────────────────────────
const modalConfig = document.getElementById('modal-config');

document.getElementById('btn-sinc').addEventListener('click', () => {
  document.getElementById('config-url').value = gasUrl;
  document.getElementById('config-status').textContent =
    gasUrl ? '✅ URL configurada. Podés cambiarla o desactivarla.' : '';
  modalConfig.classList.remove('hidden');
});

document.getElementById('btn-cerrar-config').addEventListener('click', () => {
  modalConfig.classList.add('hidden');
});

document.getElementById('btn-config-guardar').addEventListener('click', async () => {
  const url      = document.getElementById('config-url').value.trim();
  const statusEl = document.getElementById('config-status');
  if (!url) { statusEl.textContent = '❌ Ingresá una URL válida.'; return; }

  // Validar formato básico (debe ser URL de implementación de GAS)
  if (!url.includes('script.google.com/macros/s/')) {
    statusEl.textContent = '❌ URL incorrecta. Debe empezar con https://script.google.com/macros/s/...';
    return;
  }

  // Guardar URL primero (antes de testear) para que persista aunque el test falle
  gasUrl = url;
  localStorage.setItem(GAS_URL_KEY, gasUrl);
  setSincStatus('syncing');
  statusEl.textContent = '🔄 Probando conexión...';

  try {
    const resp = await fetch(`${url}?action=load&_t=${Date.now()}`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Si la nube tiene datos → descargar; si está vacía → subir los locales
    const cloudTieneDatos = (data.stock !== null && data.stock !== undefined)
                         || (Array.isArray(data.historial) && data.historial.length > 0);
    if (cloudTieneDatos) {
      statusEl.textContent = '🔄 Descargando datos de la nube...';
      await sincronizarDesdeNube();
    } else {
      statusEl.textContent = '🔄 Subiendo datos al servidor...';
      await pushToCloud();
    }

    statusEl.textContent = '✅ ¡Sincronizado correctamente!';
    setSincStatus('ok');
    setTimeout(() => modalConfig.classList.add('hidden'), 2000);

  } catch (err) {
    // Detectar error de CORS (lo más común con GAS)
    const esCors = err instanceof TypeError || err.message.includes('NetworkError') || err.message.includes('Failed to fetch');
    if (esCors) {
      setSincStatus('error');
      statusEl.innerHTML =
        '⚠️ La URL fue guardada, pero Google bloqueó el test de conexión (error CORS).<br>' +
        'Esto pasa cuando el script no está configurado como <strong>"Cualquier persona"</strong>.<br>' +
        '<strong>Verificá en Apps Script</strong>: Implementar → Gestionar implementaciones → ' +
        'el campo "Quién tiene acceso" debe ser <em>Cualquier persona (incluso anónimas)</em>.<br>' +
        'Después cerrá este modal y recargá la página.';
    } else {
      setSincStatus('error');
      statusEl.textContent = `❌ Error: ${err.message}. Verificá la URL e intentá de nuevo.`;
    }
  }
});

document.getElementById('btn-config-subir').addEventListener('click', async () => {
  const statusEl = document.getElementById('config-status');
  const btn      = document.getElementById('btn-config-subir');

  if (!gasUrl) {
    statusEl.textContent = '❌ No hay URL configurada. Pegá la URL primero y tocá "Guardar URL".';
    return;
  }

  btn.disabled    = true;
  btn.textContent = '🔄 Subiendo...';
  statusEl.textContent = '🔄 Enviando datos a Google Sheets...';

  await pushToCloud();

  btn.disabled    = false;
  btn.textContent = '⬆️ Subir datos ahora';
  statusEl.textContent = '✅ Datos enviados. Abrí tu Google Sheet y buscá las hojas "📋 Ventas" y "📊 Resumen".';
});

document.getElementById('btn-config-borrar').addEventListener('click', () => {
  if (!confirm('¿Desactivar la sincronización?\nLos datos locales se mantienen.')) return;
  gasUrl = '';
  localStorage.removeItem(GAS_URL_KEY);
  setSincStatus('idle');
  document.getElementById('config-url').value = '';
  document.getElementById('config-status').textContent = 'Sincronización desactivada.';
});

modalConfig.addEventListener('click', e => {
  if (e.target === modalConfig) modalConfig.classList.add('hidden');
});

// ── Botones ✕ para cerrar modales ────────────────────────────────────────────
document.getElementById('btn-cerrar-venta').addEventListener('click', () => {
  modalVenta.classList.add('hidden');
});
document.getElementById('btn-cerrar-editar').addEventListener('click', () => {
  modalEditar.classList.add('hidden');
});

// ── Cerrar modales al click afuera ────────────────────────────────────────────
[modalVenta, modalHistorial, modalEditar].forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderTodo();
// Siempre arranca en modo lectura — solo se desbloquea con PIN
setModoEdicion(false);
if (gasUrl) {
  setSincStatus('syncing');
  sincronizarDesdeNube(); // al abrir la app, traer datos frescos de la nube
}

// ── Helpers comunes para exportar stock ──────────────────────────────────────
function _stockResumen() {
  const totsTalle = TALLES_ADULTO.map(t =>
    VARIANTES.reduce((s, v) => s + (estado.adultos[t]?.[v] ?? 0), 0));
  const totAdultos = totsTalle.reduce((s, q) => s + q, 0);
  const totTotes   = (estado.totes.silla || 0) + (estado.totes.vereda || 0);
  const totNinos   = TALLES_NINO.reduce((s, t) => s + (estado.ninos[t] ?? 0), 0);
  const ultimaAudit = auditorias.length > 0
    ? [...auditorias].sort((a, b) => b.id - a.id)[0] : null;
  return { totsTalle, totAdultos, totTotes, totNinos, ultimaAudit };
}

// ── PDF del stock actual ──────────────────────────────────────────────────────
function generarStockPDF() {
  const ahora = new Date().toLocaleString('es-AR');
  const { totsTalle, totAdultos, totTotes, totNinos, ultimaAudit } = _stockResumen();
  const totGeneral = totAdultos + totTotes + totNinos;

  const adultRows = VARIANTES.map(v => {
    const cells = TALLES_ADULTO.map(t => `<td>${estado.adultos[t]?.[v] ?? 0}</td>`).join('');
    const sub = TALLES_ADULTO.reduce((s, t) => s + (estado.adultos[t]?.[v] ?? 0), 0);
    return `<tr><td>${LABEL_VARIANTE[v]}</td>${cells}<td><strong>${sub}</strong></td></tr>`;
  }).join('');

  // Sección último control
  let auditSection = '';
  if (ultimaAudit) {
    // Fallback: mostrar ajustes si no hay snapshot completo
    let snapTables;
    const ajustesList = ultimaAudit.ajustes || [];
    if (ajustesList.length > 0) {
      const filas = ajustesList.map(a => `<tr><td>${a.desc}</td><td>${a.anterior}</td><td>${a.nuevo}</td><td>${a.diff > 0 ? '+' : ''}${a.diff}</td></tr>`).join('');
      snapTables = `<p class="no-snap" style="margin-bottom:8px">Este control no tiene foto completa del stock. Se muestran los ajustes registrados:</p>
        <table><thead><tr><th>Artículo</th><th>Antes</th><th>Después</th><th>Diferencia</th></tr></thead>
        <tbody>${filas}</tbody></table>`;
    } else {
      snapTables = '<p class="no-snap">Control sin diferencias registradas — stock coincidió con el conteo.</p>';
    }
    if (ultimaAudit.stockSnapshot) {
      const ss = ultimaAudit.stockSnapshot;
      const snapAdultRows = VARIANTES.map(v => {
        const cells = TALLES_ADULTO.map(t => `<td>${ss.adultos[t]?.[v] ?? 0}</td>`).join('');
        const sub = TALLES_ADULTO.reduce((s, t) => s + (ss.adultos[t]?.[v] ?? 0), 0);
        return `<tr><td>${LABEL_VARIANTE[v]}</td>${cells}<td><strong>${sub}</strong></td></tr>`;
      }).join('');
      const snapTots  = TALLES_ADULTO.map(t => VARIANTES.reduce((s, v) => s + (ss.adultos[t]?.[v] ?? 0), 0));
      const snapTotA  = snapTots.reduce((s, q) => s + q, 0);
      const snapTotT  = (ss.totes.silla || 0) + (ss.totes.vereda || 0);
      const snapTotN  = TALLES_NINO.reduce((s, t) => s + (ss.ninos?.[t] ?? 0), 0);
      snapTables = `
        <h4>👕 Remeras adultos</h4>
        <table><thead><tr><th>Diseño</th>${TALLES_ADULTO.map(t=>`<th>${t}</th>`).join('')}<th>Sub</th></tr></thead>
        <tbody>${snapAdultRows}</tbody>
        <tfoot><tr><td>Total</td>${snapTots.map(q=>`<td>${q}</td>`).join('')}<td><strong>${snapTotA}</strong></td></tr></tfoot></table>
        <h4>👜 Tote Bags</h4>
        <table class="tbl-sm"><thead><tr><th>Modelo</th><th>Cant.</th></tr></thead>
        <tbody><tr><td>Reposera</td><td>${ss.totes.silla||0}</td></tr><tr><td>Vereda</td><td>${ss.totes.vereda||0}</td></tr></tbody>
        <tfoot><tr><td>Total</td><td><strong>${snapTotT}</strong></td></tr></tfoot></table>
        <h4>👶 Remeras niñxs</h4>
        <table><thead><tr>${TALLES_NINO.map(t=>`<th>T${t}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody><tr>${TALLES_NINO.map(t=>`<td>${ss.ninos?.[t]??0}</td>`).join('')}<td><strong>${snapTotN}</strong></td></tr></tbody></table>`;
    }
    auditSection = `
      <div class="page-break"></div>
      <h3>📋 Último control de stock — ${ultimaAudit.fecha}</h3>
      ${ultimaAudit.motivo ? `<p class="audit-meta">Motivo registrado: <em>${ultimaAudit.motivo}${ultimaAudit.motivoDetalle ? ' — '+ultimaAudit.motivoDetalle : ''}</em></p>` : ''}
      ${snapTables}`;
  }

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px;max-width:920px;margin:0 auto}
    .encabezado{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}
    .encabezado h1{font-size:18px}
    .encabezado .fecha{color:#666;font-size:10px}
    .resumen{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
    .res-box{background:#f4f4f4;border:1px solid #ddd;border-radius:6px;padding:8px 14px;text-align:center;min-width:90px}
    .res-box.total{background:#111;color:#fff;border-color:#111}
    .res-num{font-size:22px;font-weight:700}
    .res-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#666}
    .res-box.total .res-lbl{color:#aaa}
    h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1.5px solid #111;padding-bottom:4px;margin:20px 0 10px}
    h4{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:12px 0 5px}
    table{border-collapse:collapse;margin-bottom:12px;width:100%}
    table.tbl-sm{max-width:240px}
    th{background:#222;color:#fff;border:1px solid #333;padding:5px 7px;font-size:10px;text-align:center}
    th:first-child{text-align:left}
    td{border:1px solid #ddd;padding:4px 7px;font-size:11px;text-align:center}
    td:first-child{text-align:left;font-weight:600}
    tfoot td{background:#f0f0f0;font-weight:700}
    .audit-meta{font-size:10px;color:#555;margin-bottom:8px;font-style:italic}
    .no-snap{color:#999;font-style:italic;font-size:10px;margin-bottom:8px}
    .page-break{border-top:2px solid #111;margin:24px 0 0}
    .footer{margin-top:20px;color:#bbb;font-size:9px;border-top:1px solid #eee;padding-top:6px}
    @media print{body{padding:4px}.page-break{page-break-before:always;border:none;margin:0}}`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Stock Cayo la Cabra — ${ahora}</title>
  <style>${css}</style></head><body>
  <div class="encabezado"><h1>🐐 Cayo la Cabra — Stock</h1><span class="fecha">Generado: ${ahora}</span></div>
  <div class="resumen">
    <div class="res-box"><div class="res-num">${totAdultos}</div><div class="res-lbl">Remeras adultos</div></div>
    <div class="res-box"><div class="res-num">${totTotes}</div><div class="res-lbl">Tote Bags</div></div>
    <div class="res-box"><div class="res-num">${totNinos}</div><div class="res-lbl">Remeras niñxs</div></div>
    <div class="res-box total"><div class="res-num">${totGeneral}</div><div class="res-lbl">Total general</div></div>
  </div>
  <h3>👕 Remeras Adultos</h3>
  <table><thead><tr><th>Diseño</th>${TALLES_ADULTO.map(t=>`<th>${t}</th>`).join('')}<th>Subtotal</th></tr></thead>
  <tbody>${adultRows}</tbody>
  <tfoot><tr><td>Total</td>${totsTalle.map(q=>`<td>${q}</td>`).join('')}<td>${totAdultos}</td></tr></tfoot></table>
  <h3>👜 Tote Bags</h3>
  <table class="tbl-sm"><thead><tr><th>Modelo</th><th>Cantidad</th></tr></thead>
  <tbody><tr><td>Reposera</td><td>${estado.totes.silla||0}</td></tr><tr><td>Vereda</td><td>${estado.totes.vereda||0}</td></tr></tbody>
  <tfoot><tr><td>Total</td><td>${totTotes}</td></tr></tfoot></table>
  <h3>👶 Remeras Niñxs</h3>
  <table><thead><tr>${TALLES_NINO.map(t=>`<th>T${t}</th>`).join('')}<th>Total</th></tr></thead>
  <tbody><tr>${TALLES_NINO.map(t=>`<td>${estado.ninos[t]??0}</td>`).join('')}<td><strong>${totNinos}</strong></td></tr></tbody></table>
  ${auditSection}
  <p class="footer">Generado desde la app de stock · Cayo la Cabra</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Exportar stock por WhatsApp ───────────────────────────────────────────────
function exportarStockWhatsApp() {
  const ahora = new Date().toLocaleString('es-AR');
  const { totsTalle, totAdultos, totTotes, totNinos, ultimaAudit } = _stockResumen();
  const totGeneral = totAdultos + totTotes + totNinos;

  // Tabla monoespaciada (se muestra como código en WhatsApp con ```)
  const rp = (s, n) => String(s).padStart(n);
  const lp = (s, n) => String(s).padEnd(n);
  const lW = 15, nW = 4;
  const sep = '─'.repeat(lW + nW * TALLES_ADULTO.length + nW + 1);

  const bloque = [
    'REMERAS ADULTOS',
    lp('', lW) + TALLES_ADULTO.map(t => rp(t, nW)).join('') + rp('Total', nW + 1),
    sep,
    ...VARIANTES.map(v => {
      const sub = TALLES_ADULTO.reduce((s, t) => s + (estado.adultos[t]?.[v] ?? 0), 0);
      return lp(LABEL_VARIANTE[v], lW)
        + TALLES_ADULTO.map(t => rp(estado.adultos[t]?.[v] ?? 0, nW)).join('')
        + rp(sub, nW + 1);
    }),
    sep,
    lp('TOTAL', lW) + totsTalle.map(q => rp(q, nW)).join('') + rp(totAdultos, nW + 1),
    '',
    'TOTE BAGS',
    `Reposera: ${rp(estado.totes.silla || 0, 2)}   Vereda: ${rp(estado.totes.vereda || 0, 2)}   Total: ${totTotes}`,
    '',
    'REMERAS NIÑXS',
    TALLES_NINO.map(t => rp('T' + t, nW)).join('') + rp('Total', nW + 1),
    TALLES_NINO.map(t => rp(estado.ninos[t] ?? 0, nW)).join('') + rp(totNinos, nW + 1),
    '',
    `TOTAL GENERAL: ${totGeneral} unidades`,
  ].join('\n');

  const lines = [
    '*🐐 Cayo la Cabra — Stock*',
    `📅 ${ahora}`,
    '',
    '```',
    bloque,
    '```',
    '',
    ultimaAudit
      ? `_📋 Último control de stock: ${ultimaAudit.fecha}_`
      : '_Sin controles de stock registrados_',
  ];

  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

// ── Exportar ventas ───────────────────────────────────────────────────────────
function _ventasRango() {
  const desdeEl = document.getElementById('export-desde');
  const hastaEl = document.getElementById('export-hasta');
  const desde = desdeEl?.value ? new Date(desdeEl.value + 'T00:00:00').getTime() : 0;
  const hasta = hastaEl?.value ? new Date(hastaEl.value + 'T23:59:59').getTime() : Infinity;
  const ventas = historial.filter(h => h.id >= desde && h.id <= hasta);
  const desdeTxt = desdeEl?.value ? new Date(desdeEl.value + 'T00:00:00').toLocaleDateString('es-AR') : null;
  const hastaTxt = hastaEl?.value ? new Date(hastaEl.value + 'T00:00:00').toLocaleDateString('es-AR') : null;
  const label = (desdeTxt || hastaTxt)
    ? `${desdeTxt || '...'} → ${hastaTxt || '...'}`
    : 'Todas las fechas';
  return { ventas, label };
}

function _ventasTotales(ventas) {
  const totalARS = ventas.filter(h => (h.moneda||'ARS')==='ARS').reduce((s,h)=>s+(h.ingreso??0),0);
  const totalUYU = ventas.filter(h => (h.moneda||'ARS')==='UYU').reduce((s,h)=>s+(h.ingreso??0),0);
  const totEfec  = ventas.reduce((s,h)=>s+(h.pago==='efectivo'?(h.ingreso??0):0),0);
  const totTrans = ventas.reduce((s,h)=>s+(h.pago==='transferencia'?(h.ingreso??0):0),0);
  const totReg    = ventas.reduce((s,h)=>h.pago==='regalo'?s+h.cantidad:s,0);
  const totAnota  = ventas.reduce((s,h)=>h.pago==='anota'?s+(h.precioUnit||0)*h.cantidad:s,0);
  const cobradas  = ventas.filter(h=>h.pago==='efectivo'||h.pago==='transferencia');
  const unidRem   = cobradas.filter(h=>h._stock?.tipo==='adulto').reduce((s,h)=>s+h.cantidad,0);
  const unidTote  = cobradas.filter(h=>h._stock?.tipo==='tote').reduce((s,h)=>s+h.cantidad,0);
  const unidNino  = cobradas.filter(h=>h._stock?.tipo==='nino').reduce((s,h)=>s+h.cantidad,0);
  const pegEntradas = ventas.filter(h=>h._stock?.tipo==='pegotines');
  const totPegARS = pegEntradas.filter(h=>(h.moneda||'ARS')==='ARS').reduce((s,h)=>s+(h.ingreso??0),0);
  const totPegUYU = pegEntradas.filter(h=>(h.moneda||'ARS')==='UYU').reduce((s,h)=>s+(h.ingreso??0),0);
  return { totalARS, totalUYU, totEfec, totTrans, totReg, totAnota, unidRem, unidTote, unidNino, totPegARS, totPegUYU };
}

function exportarVentasPDF() {
  const { ventas, label } = _ventasRango();
  const ahora = new Date().toLocaleString('es-AR');
  const { totalARS, totalUYU, totEfec, totTrans, totReg, totAnota, unidRem, unidTote, unidNino, totPegARS, totPegUYU } = _ventasTotales(ventas);
  const fmtP = n => '$' + n.toLocaleString('es-AR');
  const pagoLabel = p => ({efectivo:'Efectivo',transferencia:'Transf.',regalo:'Regalo',anota:'Anota'}[p]||p);

  const rows = [...ventas].sort((a,b)=>a.id-b.id).map(h => {
    const mon = (h.moneda||'ARS')==='UYU' ? ' UYU' : '';
    const pagoColor = h.pago==='regalo'?'#27ae60':h.pago==='anota'?'#e67e22':'#333';
    const totalTxt = h.pago==='regalo' ? 'Regalo'
      : h.pago==='anota' ? `Adeuda ${fmtP((h.precioUnit||0)*h.cantidad)}${mon}`
      : fmtP(h.ingreso??0)+mon;
    return `<tr>
      <td class="col-fecha">${h.fecha}</td>
      <td>${h.descripcion}${h.nombreAnota?`<br><small>👤 ${h.nombreAnota}</small>`:''}</td>
      <td class="col-c">${h.cantidad}</td>
      <td class="col-r">${h.precioUnit?fmtP(h.precioUnit)+mon:'-'}</td>
      <td class="col-r bold">${totalTxt}</td>
      <td class="col-c" style="color:${pagoColor}">${pagoLabel(h.pago)}</td>
    </tr>`;
  }).join('');

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:20px;max-width:900px;margin:0 auto}
    .enc{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
    .enc h1{font-size:15px}.enc .meta{color:#666;font-size:9px;text-align:right}
    .res{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
    .rb{background:#f4f4f4;border:1px solid #ddd;border-radius:5px;padding:6px 10px;text-align:center;min-width:75px}
    .rb.dark{background:#111;color:#fff;border-color:#111}
    .rn{font-size:14px;font-weight:700}.rl{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#666}
    .rb.dark .rl{color:#aaa}
    table{border-collapse:collapse;width:100%}
    th{background:#222;color:#fff;border:1px solid #333;padding:4px 6px;font-size:9px;text-align:left}
    td{border:1px solid #ddd;padding:3px 5px;font-size:9px;vertical-align:top}
    tr:nth-child(even) td{background:#fafafa}
    .col-fecha{white-space:nowrap;color:#555}.col-c{text-align:center}.col-r{text-align:right}
    .bold{font-weight:700}small{color:#888;font-size:8px}
    .footer{margin-top:10px;color:#bbb;font-size:8px;border-top:1px solid #eee;padding-top:5px}
    @media print{body{padding:4px}}`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Ventas — Cayo la Cabra</title><style>${css}</style></head><body>
  <div class="enc">
    <div><h1>🐐 Cayo la Cabra — Ventas</h1>
    <div style="color:#666;font-size:9px;margin-top:2px">Período: ${label}</div></div>
    <div class="meta">Generado: ${ahora}<br>${ventas.length} venta${ventas.length!==1?'s':''}</div>
  </div>
  <div class="res">
    <div class="rb dark"><div class="rn">${unidRem+unidTote+unidNino}</div><div class="rl">Unidades cobradas</div></div>
    <div class="rb"><div class="rn">${fmtP(totalARS)}</div><div class="rl">Total ARS</div></div>
    ${totalUYU>0?`<div class="rb"><div class="rn">${fmtP(totalUYU)} UYU</div><div class="rl">Total UYU</div></div>`:''}
    <div class="rb"><div class="rn">${fmtP(totEfec)}</div><div class="rl">Efectivo</div></div>
    <div class="rb"><div class="rn">${fmtP(totTrans)}</div><div class="rl">Transferencia</div></div>
    ${totReg>0?`<div class="rb"><div class="rn">${totReg} u.</div><div class="rl">Regalos</div></div>`:''}
    ${totAnota>0?`<div class="rb"><div class="rn">${fmtP(totAnota)}</div><div class="rl">Anotados (deben)</div></div>`:''}
    ${(totPegARS>0||totPegUYU>0)?`<div class="rb" style="border-color:rgba(155,89,182,0.4)"><div class="rn" style="color:#9b59b6">${totPegARS>0?fmtP(totPegARS):''}${totPegUYU>0?(totPegARS>0?' · ':'')+fmtP(totPegUYU)+' UYU':''}</div><div class="rl">Pegotines</div></div>`:''}
  </div>
  <table>
    <thead><tr><th>Fecha</th><th>Artículo</th><th>Cant.</th><th>Precio u.</th><th>Total</th><th>Pago</th></tr></thead>
    <tbody>${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;padding:12px;color:#999">Sin ventas en este período</td></tr>'}</tbody>
  </table>
  <p class="footer">Generado desde la app de stock · Cayo la Cabra</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function exportarVentasWhatsApp() {
  const { ventas, label } = _ventasRango();
  const ahora = new Date().toLocaleString('es-AR');
  const { totalARS, totalUYU, totEfec, totTrans, totReg, totAnota, unidRem, unidTote, unidNino, totPegARS, totPegUYU } = _ventasTotales(ventas);
  const fmtP = n => '$' + n.toLocaleString('es-AR');

  const lines = [
    '*🐐 Cayo la Cabra — Ventas*',
    `📅 Período: ${label}`,
    `${ventas.length} venta${ventas.length!==1?'s':''}`,
    '',
    '💰 *Totales*',
    `  ARS: ${fmtP(totalARS)}`,
    ...(totalUYU>0?[`  UYU: ${fmtP(totalUYU)}`]:[]),
    `  Efectivo: ${fmtP(totEfec)}`,
    `  Transferencia: ${fmtP(totTrans)}`,
    ...(totReg>0?[`  Regalos: ${totReg} u.`]:[]),
    ...(totAnota>0?[`  Anotados (deben): ${fmtP(totAnota)}`]:[]),
    '',
    `📦 *Unidades cobradas: ${unidRem+unidTote+unidNino}*`,
    ...(unidRem>0?[`  Remeras adultos: ${unidRem}`]:[]),
    ...(unidTote>0?[`  Tote bags: ${unidTote}`]:[]),
    ...(unidNino>0?[`  Remeras niñxs: ${unidNino}`]:[]),
    ...((totPegARS>0||totPegUYU>0)?[`🎟️ *Pegotines: ${[totPegARS>0?fmtP(totPegARS):null,totPegUYU>0?fmtP(totPegUYU)+' UYU':null].filter(Boolean).join(' · ')}*`]:[]),
    '',
    `_Generado ${ahora}_`,
  ];

  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

// ── Descargar PDF de auditoría ────────────────────────────────────────────────
window.descargarAuditoriaPDF = function(id) {
  const a = auditorias.find(x => x.id === id);
  if (!a) return;

  // Ajustes
  const ajustesRows = a.ajustes.map(aj => {
    const d = aj.diff > 0 ? `+${aj.diff}` : String(aj.diff);
    const c = aj.diff < 0 ? '#c0392b' : '#27ae60';
    return `<tr><td>${aj.desc}</td><td>${aj.anterior}</td><td>${aj.nuevo}</td>
            <td style="color:${c};font-weight:700;text-align:center">${d}</td></tr>`;
  }).join('');

  const ajustesSection = a.ajustes.length > 0 ? `
    <h3>Ajustes aplicados (${a.ajustes.length})</h3>
    <table>
      <thead><tr><th>Ítem</th><th>Anterior</th><th>Contado</th><th>Diferencia</th></tr></thead>
      <tbody>${ajustesRows}</tbody>
    </table>` : `<p class="ok-msg">✅ Sin diferencias — todo lo contado coincidió con el sistema.</p>`;

  const motivoSection = a.motivo
    ? `<p><strong>Motivo:</strong> ${a.motivo}${a.motivoDetalle ? ` — ${a.motivoDetalle}` : ''}</p>` : '';

  // Stock snapshot
  let snapshotSection = '';
  if (a.stockSnapshot) {
    const ss = a.stockSnapshot;
    const adultRows = VARIANTES.map(v => {
      const cells = TALLES_ADULTO.map(t => `<td>${ss.adultos[t]?.[v] ?? 0}</td>`).join('');
      const sub = TALLES_ADULTO.reduce((s, t) => s + (ss.adultos[t]?.[v] ?? 0), 0);
      return `<tr><td>${LABEL_VARIANTE[v]}</td>${cells}<td><strong>${sub}</strong></td></tr>`;
    }).join('');
    const totsPorTalle = TALLES_ADULTO.map(t =>
      VARIANTES.reduce((s, v) => s + (ss.adultos[t]?.[v] ?? 0), 0));
    const totAdulto = totsPorTalle.reduce((s, q) => s + q, 0);
    const totTotes  = (ss.totes.silla || 0) + (ss.totes.vereda || 0);
    const totNinos  = TALLES_NINO.reduce((s, t) => s + (ss.ninos?.[t] ?? 0), 0);

    snapshotSection = `
      <h3>Stock verificado en este control</h3>
      <h4>👕 Remeras Adultos</h4>
      <table>
        <thead><tr><th>Diseño</th>${TALLES_ADULTO.map(t=>`<th>${t}</th>`).join('')}<th>Sub</th></tr></thead>
        <tbody>${adultRows}</tbody>
        <tfoot><tr><td><strong>Total</strong></td>${totsPorTalle.map(q=>`<td><strong>${q}</strong></td>`).join('')}<td><strong>${totAdulto}</strong></td></tr></tfoot>
      </table>
      <h4>👜 Tote Bags</h4>
      <table>
        <thead><tr><th>Modelo</th><th>Cantidad</th></tr></thead>
        <tbody>
          <tr><td>Reposera</td><td>${ss.totes.silla || 0}</td></tr>
          <tr><td>Vereda</td><td>${ss.totes.vereda || 0}</td></tr>
        </tbody>
        <tfoot><tr><td><strong>Total</strong></td><td><strong>${totTotes}</strong></td></tr></tfoot>
      </table>
      <h4>👶 Remeras Niñxs</h4>
      <table>
        <thead><tr>${TALLES_NINO.map(t=>`<th>T${t}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody><tr>${TALLES_NINO.map(t=>`<td>${ss.ninos?.[t]??0}</td>`).join('')}<td><strong>${totNinos}</strong></td></tr></tbody>
      </table>`;
  }

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Control de Stock — ${a.fecha}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;color:#222;padding:24px;max-width:900px;margin:0 auto}
    h1{font-size:17px;margin-bottom:4px}
    h2{font-size:12px;color:#666;margin-bottom:16px;font-weight:normal}
    h3{font-size:13px;margin:18px 0 8px;border-bottom:2px solid #222;padding-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
    h4{font-size:11px;margin:12px 0 6px;color:#555;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{background:#f0f0f0;border:1px solid #ccc;padding:4px 7px;font-size:10px;text-align:center}
    th:first-child{text-align:left}
    td{border:1px solid #ddd;padding:4px 7px;font-size:10px;text-align:center}
    td:first-child{text-align:left}
    tfoot td{background:#f9f9f9}
    p{margin:6px 0;font-size:11px}
    .ok-msg{color:#27ae60;font-weight:700;margin:12px 0}
    .footer{margin-top:24px;color:#aaa;font-size:9px}
    @media print{body{padding:0}}
  </style></head><body>
  <h1>🐐 Cayo la Cabra — Control de Stock</h1>
  <h2>📅 ${a.fecha}</h2>
  ${motivoSection}
  ${ajustesSection}
  ${snapshotSection}
  <p class="footer">Generado desde la app de stock · Cayo la Cabra</p>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};
