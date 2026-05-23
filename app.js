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

const PRECIOS = { remera: 25000, tote: 16000 };

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

// ── Persistencia ──────────────────────────────────────────────────────────────
function cargarEstado() {
  try {
    const raw = localStorage.getItem('cayo_stock');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return JSON.parse(JSON.stringify(STOCK_INICIAL));
}

function cargarHistorial() {
  try {
    const raw = localStorage.getItem('cayo_historial');
    if (raw) {
      const arr = JSON.parse(raw);
      let changed = false;
      arr.forEach(h => {
        // Asignar id a entradas viejas
        if (!h.id) { h.id = Date.now() + Math.random(); changed = true; }
        // Normalizar entradas sin método de pago (anteriores a esa función)
        if (h.pago === undefined || h.pago === null) {
          h.pago = 'efectivo';
          changed = true;
        }
        // Normalizar entradas sin ingreso calculado
        if (h.ingreso === undefined || h.ingreso === null) {
          const precio = h.precioUnit ?? 0;
          h.ingreso = h.pago === 'regalo' ? 0 : precio * (h.cantidad ?? 1);
          changed = true;
        }
        // Normalizar entradas sin precioUnit
        if (h.precioUnit === undefined || h.precioUnit === null) {
          // Inferir precio por tipo de producto desde descripción
          if (h.descripcion && h.descripcion.startsWith('Tote')) {
            h.precioUnit = 16000;
          } else {
            h.precioUnit = 25000;
          }
          changed = true;
        }
      });
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
  localStorage.setItem('cayo_stock',    JSON.stringify(estado));
  localStorage.setItem('cayo_historial', JSON.stringify(historial));
}

let estado   = cargarEstado();
let historial = cargarHistorial();

// ── Tabs ──────────────────────────────────────────────────────────────────────
window.irATab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'auditoria') renderAuditoria();
  if (tab === 'ventas')    renderVentas();
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
  const totales = { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 0, reposeraNegra: 0, blanca: 0 };

  tbody.innerHTML = TALLES_ADULTO.map(talle => {
    const row = estado.adultos[talle];
    const sub = VARIANTES.reduce((s, v) => s + row[v], 0);
    VARIANTES.forEach(v => { totales[v] += row[v]; });
    return `<tr>
      <td class="talle-label">${talle}</td>
      ${VARIANTES.map(v => `<td class="${COL_CLASS[v]} ${claseStock(row[v])}">${row[v]}</td>`).join('')}
      <td class="subtotal-col">${sub}</td>
    </tr>`;
  }).join('');

  const totalSub = VARIANTES.reduce((s, v) => s + totales[v], 0);
  tfoot.innerHTML = `<tr>
    <td>Total</td>
    ${VARIANTES.map(v => `<td class="${COL_CLASS[v]}">${totales[v]}</td>`).join('')}
    <td class="subtotal-col">${totalSub}</td>
  </tr>`;
  document.getElementById('total-remeras').textContent = totalSub;
}

function renderTotes() {
  const tbody = document.getElementById('tbody-totes');
  const t = estado.totes;
  tbody.innerHTML = `
    <tr><td>Reposera</td><td class="${claseStock(t.silla)}">${t.silla}</td></tr>
    <tr><td>Vereda</td><td class="${claseStock(t.vereda)}">${t.vereda}</td></tr>
    <tr><td style="font-weight:700">Total</td><td style="font-weight:700;color:var(--acento)">${t.silla + t.vereda}</td></tr>
  `;
  document.getElementById('total-totes').textContent = t.silla + t.vereda;
}

function renderNinos() {
  const tbody = document.getElementById('tbody-ninos');
  const tfoot = document.getElementById('tfoot-ninos');
  const n = estado.ninos;
  let total = 0;
  tbody.innerHTML = TALLES_NINO.map(t => {
    const v = n[t] ?? 0;
    total += v;
    return `<tr><td class="talle-label">${t}</td><td class="${claseStock(v)}">${v}</td></tr>`;
  }).join('');
  tfoot.innerHTML = `<tr><td>Total</td><td style="color:var(--acento);font-weight:700">${total}</td></tr>`;
  document.getElementById('total-ninos').textContent = total;
}

function formatPeso(n) {
  return '$' + n.toLocaleString('es-AR');
}

function renderRecaudado() {
  const total = historial.reduce((s, h) => s + (h.ingreso ?? 0), 0);
  document.getElementById('total-recaudado').textContent = formatPeso(total);
}

function renderTodo() {
  renderAdultos();
  renderTotes();
  renderNinos();
  renderRecaudado();
  // Refrescar ventas si la pestaña está activa
  if (!document.getElementById('tab-ventas').classList.contains('hidden')) renderVentas();
}

// ── Tab Ventas ────────────────────────────────────────────────────────────────
let filtroVentas = 'todos';

function renderVentas() {
  const totalRec  = historial.reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalEfec = historial.reduce((s, h) => s + (h.pago === 'efectivo'      ? (h.ingreso ?? 0) : 0), 0);
  const totalTrans = historial.reduce((s, h) => s + (h.pago === 'transferencia' ? (h.ingreso ?? 0) : 0), 0);
  const totalRegU  = historial.reduce((s, h) => h.pago === 'regalo' ? s + h.cantidad : s, 0);

  document.getElementById('v-total').textContent    = formatPeso(totalRec);
  document.getElementById('v-efectivo').textContent = formatPeso(totalEfec);
  document.getElementById('v-transf').textContent   = formatPeso(totalTrans);
  document.getElementById('v-regalos').textContent  = `${totalRegU} u.`;

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
    const pagoLabel = h.pago === 'transferencia' ? 'Transf.' : h.pago === 'regalo' ? '🎁 Regalo' : 'Efect.';
    const edicionesHtml = h._ediciones?.length
      ? `<div class="ediciones-log">${h._ediciones.map(e =>
          `<div class="edicion-entrada">📝 ${e.fecha}: ${e.detalle}</div>`
        ).join('')}</div>`
      : '';
    return `
    <div class="venta-item${h._ediciones?.length ? ' tiene-ediciones' : ''}">
      <div class="venta-item-main">
        <span class="venta-desc">${h.descripcion}</span>
        <span class="venta-cant">-${h.cantidad}</span>
        <span class="venta-ingreso">${h.ingreso ? formatPeso(h.ingreso) : '—'}</span>
        <span class="hist-pago hist-pago--${h.pago ?? 'efectivo'}">${pagoLabel}</span>
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

function precioBase(cat) {
  if (cat === 'tote') return PRECIOS.tote;
  return PRECIOS.remera;
}

function precioEfectivo() {
  const override = parseInt(inputPrecioOverride.value, 10);
  return (!isNaN(override) && override > 0) ? override : precioBase(selCategoria.value);
}

function actualizarDisponible() {
  const cat   = selCategoria.value;
  let disp    = null;

  if (cat === 'adulto') {
    disp = estado.adultos[selTalleAdulto.value]?.[selVarianteAdulto.value] ?? 0;
  } else if (cat === 'nino') {
    disp = estado.ninos[selTalleNino.value] ?? 0;
  } else if (cat === 'tote') {
    disp = estado.totes[selTote.value] ?? 0;
  }

  const cant        = parseInt(inputCantidad.value, 10) || 1;
  const precio      = precioEfectivo();
  const pUnit       = document.getElementById('venta-precio-unit');
  const pTotalVenta = document.getElementById('venta-total-venta');

  if (disp !== null) {
    pDisponible.textContent = `Disponible: ${disp}`;
    pDisponible.style.color = disp === 0 ? 'var(--acento)' : 'var(--verde)';
    pUnit.textContent       = `Precio: ${formatPeso(precio)} c/u`;
    pTotalVenta.textContent = `Total: ${formatPeso(precio * cant)}`;
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
  actualizarDisponible();
});

[selTalleAdulto, selVarianteAdulto, selTalleNino, selTote, inputCantidad, inputPrecioOverride].forEach(el =>
  el.addEventListener('change', actualizarDisponible)
);
inputCantidad.addEventListener('input', actualizarDisponible);
inputPrecioOverride.addEventListener('input', actualizarDisponible);

document.getElementById('btn-venta').addEventListener('click', () => {
  selCategoria.value = '';
  ocultarCampos();
  inputCantidad.value = 1;
  inputPrecioOverride.value = '';
  pDisponible.textContent = '';
  pError.classList.add('hidden');
  document.getElementById('venta-precio-unit').textContent  = '';
  document.getElementById('venta-total-venta').textContent  = '';
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
    disponible = estado.adultos[talle][variante];
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.adultos[talle][variante] -= cant;
    descripcion = `Remera ${LABEL_VARIANTE[variante]} talle ${talle}`;
    precio      = PRECIOS.remera;
    _stock      = { tipo: 'adulto', talle, variante };

  } else if (cat === 'nino') {
    const talle = selTalleNino.value;
    disponible  = estado.ninos[talle] ?? 0;
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.ninos[talle] -= cant;
    descripcion = `Remera Niñx Reposera Roja talle ${talle}`;
    precio      = PRECIOS.remera;
    _stock      = { tipo: 'nino', talle };

  } else if (cat === 'tote') {
    const modelo = selTote.value;
    disponible   = estado.totes[modelo];
    if (cant > disponible) { mostrarError(`Stock insuficiente. Disponible: ${disponible}`); return; }
    estado.totes[modelo] -= cant;
    descripcion = `Tote Bag ${modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
    precio      = PRECIOS.tote;
    _stock      = { tipo: 'tote', modelo };
  }

  // Precio final: override manual o precio por defecto
  const precioFinal = precioEfectivo();
  const pago    = document.querySelector('input[name="pago"]:checked').value;
  const ingreso = pago === 'regalo' ? 0 : precioFinal * cant;

  historial.unshift({
    id: Date.now(),
    fecha: new Date().toLocaleString('es-AR'),
    descripcion,
    cantidad: cant,
    ingreso,
    pago,
    precioUnit: precioFinal,
    _stock,
  });

  guardar();
  renderTodo();
  modalVenta.classList.add('hidden');
  // Reset radio pago a efectivo
  document.querySelector('input[name="pago"][value="efectivo"]').checked = true;
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
    return `
    <div class="historial-item${h._ediciones?.length ? ' tiene-ediciones' : ''}">
      <span class="hist-desc">${h.descripcion}</span>
      <span class="hist-cant">-${h.cantidad}</span>
      <span class="hist-ingreso">${h.ingreso ? formatPeso(h.ingreso) : ''}</span>
      <span class="hist-pago hist-pago--${h.pago ?? 'efectivo'}">${h.pago === 'transferencia' ? 'Transf.' : h.pago === 'regalo' ? '🎁 Regalo' : 'Efect.'}</span>
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
  if (cambios.length > 0) {
    h._ediciones = h._ediciones || [];
    h._ediciones.push({ fecha: new Date().toLocaleString('es-AR'), detalle: cambios.join(' | ') });
  }

  // 4. Actualizar entrada del historial
  h.descripcion = nuevaDesc;
  h.cantidad    = nuevaCant;
  h.pago        = nuevoPago;
  h.precioUnit  = nuevoPrecio;
  h.ingreso     = nuevoPago === 'regalo' ? 0 : nuevoPrecio * nuevaCant;
  h._stock      = nuevo_stock;

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

  // Adultos
  const filasAdultos = TALLES_ADULTO.map(talle => {
    const row = estado.adultos[talle];
    return `<tr>
      <td class="talle-label">${talle}</td>
      ${VARIANTES.map(v => `
        <td>
          <div class="audit-cell">
            <span class="audit-actual">${row[v]}</span>
            <input type="number" class="audit-input" min="0"
              data-tipo="adulto" data-talle="${talle}" data-variante="${v}"
              placeholder="${row[v]}" />
          </div>
        </td>`).join('')}
    </tr>`;
  }).join('');

  // Totes
  const filaToteReposera = `<tr>
    <td>Reposera</td>
    <td>
      <div class="audit-cell">
        <span class="audit-actual">${estado.totes.silla}</span>
        <input type="number" class="audit-input" min="0"
          data-tipo="tote" data-modelo="silla"
          placeholder="${estado.totes.silla}" />
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
          placeholder="${estado.totes.vereda}" />
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
            placeholder="${v}" />
        </div>
      </td>
    </tr>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="audit-leyenda">
      <span class="audit-leyenda-item"><span class="audit-actual">N</span> = sistema</span>
      <span class="audit-leyenda-item"><input type="number" style="width:3.5rem" readonly placeholder="N" /> = físico (dejá vacío si coincide)</span>
    </div>

    <div class="seccion">
      <h2>Remeras Adulto</h2>
      <div class="tabla-container">
        <table>
          <thead>
            <tr>
              <th>Talle</th>
              <th>Reposera Roja</th>
              <th>Reposera Negra</th>
              <th>Blanca</th>
              <th>Vereda Roja</th>
              <th>Vereda Negra</th>
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
}

document.getElementById('btn-guardar-auditoria').addEventListener('click', () => {
  const inputs = document.querySelectorAll('.audit-input');
  const ajustes = [];

  inputs.forEach(input => {
    const val = input.value.trim();
    if (val === '') return; // sin cambio
    const fisico = parseInt(val, 10);
    if (isNaN(fisico) || fisico < 0) return;

    const tipo    = input.dataset.tipo;
    const talle   = input.dataset.talle;
    const variante = input.dataset.variante;
    const modelo  = input.dataset.modelo;

    if (tipo === 'adulto') {
      const actual = estado.adultos[talle][variante];
      if (fisico !== actual) {
        ajustes.push(`${LABEL_VARIANTE[variante]} talle ${talle}: ${actual} → ${fisico}`);
        estado.adultos[talle][variante] = fisico;
      }
    } else if (tipo === 'tote') {
      const actual = estado.totes[modelo];
      if (fisico !== actual) {
        ajustes.push(`Tote ${modelo === 'silla' ? 'Reposera' : 'Vereda'}: ${actual} → ${fisico}`);
        estado.totes[modelo] = fisico;
      }
    } else if (tipo === 'nino') {
      const actual = estado.ninos[talle] ?? 0;
      if (fisico !== actual) {
        ajustes.push(`Niñx talle ${talle}: ${actual} → ${fisico}`);
        estado.ninos[talle] = fisico;
      }
    }
  });

  if (ajustes.length === 0) {
    alert('Sin diferencias. No se realizaron ajustes.');
    return;
  }

  guardar();
  renderTodo();
  renderAuditoria();

  const msg = `✅ Ajustes aplicados (${ajustes.length}):\n\n${ajustes.join('\n')}`;
  alert(msg);
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
