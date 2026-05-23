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

const VARIANTES = ['veredaRoja', 'veredaNegra', 'reposeraRoja', 'reposeraNegra', 'blanca'];
const TALLES_ADULTO = ['S', 'M', 'L', 'XL', 'XXL'];
const TALLES_NINO = [2, 4, 6, 8, 10, 12, 16];

const PRECIOS = { remera: 25000, tote: 16000 };

const LABEL_VARIANTE = {
  veredaRoja:    'Vereda Roja',
  veredaNegra:   'Vereda Negra',
  reposeraRoja:  'Reposera Roja',
  reposeraNegra: 'Reposera Negra',
  blanca:        'Blanca',
};

const COL_CLASS = {
  veredaRoja: 'col-vr',
  veredaNegra: 'col-vn',
  reposeraRoja: 'col-rr',
  reposeraNegra: 'col-rn',
  blanca: 'col-bl',
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
      // Asignar id a entradas viejas que no lo tienen
      let changed = false;
      arr.forEach(h => { if (!h.id) { h.id = Date.now() + Math.random(); changed = true; } });
      if (changed) localStorage.setItem('cayo_historial', JSON.stringify(arr));
      return arr;
    }
  } catch (_) {}
  return [];
}

// Infiere qué stock restaurar a partir de la descripción (para entradas viejas sin _stock)
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
  localStorage.setItem('cayo_stock', JSON.stringify(estado));
  localStorage.setItem('cayo_historial', JSON.stringify(historial));
}

let estado = cargarEstado();
let historial = cargarHistorial();

// ── Render ────────────────────────────────────────────────────────────────────
function claseStock(n) {
  if (n === 0) return 'stock-0';
  if (n <= 2)  return 'stock-low';
  return '';
}

function celda(val) {
  const cls = claseStock(val);
  return `<td class="${cls}">${val}</td>`;
}

function renderAdultos() {
  const tbody = document.getElementById('tbody-adultos');
  const tfoot = document.getElementById('tfoot-adultos');
  let totales = { veredaRoja: 0, veredaNegra: 0, reposeraRoja: 0, reposeraNegra: 0, blanca: 0 };
  let totalGeneral = 0;

  tbody.innerHTML = TALLES_ADULTO.map(talle => {
    const row = estado.adultos[talle];
    const sub = VARIANTES.reduce((s, v) => s + row[v], 0);
    VARIANTES.forEach(v => { totales[v] += row[v]; });
    totalGeneral += sub;
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
}

// ── Modal Venta ───────────────────────────────────────────────────────────────
const modalVenta = document.getElementById('modal-venta');
const selCategoria = document.getElementById('venta-categoria');
const camposAdulto = document.getElementById('campos-adulto');
const camposNino   = document.getElementById('campos-nino');
const camposTote   = document.getElementById('campos-tote');
const selTalleAdulto  = document.getElementById('venta-talle-adulto');
const selVarianteAdulto = document.getElementById('venta-variante-adulto');
const selTalleNino = document.getElementById('venta-talle-nino');
const selTote      = document.getElementById('venta-tote');
const inputCantidad = document.getElementById('venta-cantidad');
const pDisponible  = document.getElementById('venta-disponible');
const pError       = document.getElementById('venta-error');

function ocultarCampos() {
  [camposAdulto, camposNino, camposTote].forEach(c => c.classList.add('hidden'));
}

function actualizarDisponible() {
  const cat = selCategoria.value;
  let disp = null;
  let precio = 0;

  if (cat === 'adulto') {
    const talle = selTalleAdulto.value;
    const variante = selVarianteAdulto.value;
    disp = estado.adultos[talle]?.[variante] ?? 0;
    precio = PRECIOS.remera;
  } else if (cat === 'nino') {
    disp = estado.ninos[selTalleNino.value] ?? 0;
    precio = PRECIOS.remera;
  } else if (cat === 'tote') {
    disp = estado.totes[selTote.value] ?? 0;
    precio = PRECIOS.tote;
  }

  const cant = parseInt(inputCantidad.value, 10) || 1;
  const pUnit = document.getElementById('venta-precio-unit');
  const pTotalVenta = document.getElementById('venta-total-venta');

  if (disp !== null) {
    pDisponible.textContent = `Disponible: ${disp}`;
    pDisponible.style.color = disp === 0 ? 'var(--acento)' : 'var(--verde)';
    pUnit.textContent = `Precio: ${formatPeso(precio)} c/u`;
    pTotalVenta.textContent = `Total: ${formatPeso(precio * cant)}`;
  } else {
    pDisponible.textContent = '';
    pUnit.textContent = '';
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

[selTalleAdulto, selVarianteAdulto, selTalleNino, selTote, inputCantidad].forEach(el =>
  el.addEventListener('change', actualizarDisponible)
);
inputCantidad.addEventListener('input', actualizarDisponible);

document.getElementById('btn-venta').addEventListener('click', () => {
  selCategoria.value = '';
  ocultarCampos();
  inputCantidad.value = 1;
  pDisponible.textContent = '';
  pError.classList.add('hidden');
  modalVenta.classList.remove('hidden');
});

document.getElementById('btn-cancelar-venta').addEventListener('click', () => {
  modalVenta.classList.add('hidden');
});

document.getElementById('form-venta').addEventListener('submit', e => {
  e.preventDefault();
  pError.classList.add('hidden');

  const cat = selCategoria.value;
  const cant = parseInt(inputCantidad.value, 10);
  if (!cat || isNaN(cant) || cant < 1) return;

  let descripcion = '';
  let disponible = 0;
  let precio = 0;

  let _stock;
  if (cat === 'adulto') {
    const talle = selTalleAdulto.value;
    const variante = selVarianteAdulto.value;
    disponible = estado.adultos[talle][variante];
    if (cant > disponible) {
      mostrarError(`Stock insuficiente. Disponible: ${disponible}`);
      return;
    }
    estado.adultos[talle][variante] -= cant;
    descripcion = `Remera ${LABEL_VARIANTE[variante]} talle ${talle}`;
    precio = PRECIOS.remera;
    _stock = { tipo: 'adulto', talle, variante };

  } else if (cat === 'nino') {
    const talle = selTalleNino.value;
    disponible = estado.ninos[talle] ?? 0;
    if (cant > disponible) {
      mostrarError(`Stock insuficiente. Disponible: ${disponible}`);
      return;
    }
    estado.ninos[talle] -= cant;
    descripcion = `Remera Niñx Reposera Roja talle ${talle}`;
    precio = PRECIOS.remera;
    _stock = { tipo: 'nino', talle };

  } else if (cat === 'tote') {
    const modelo = selTote.value;
    disponible = estado.totes[modelo];
    if (cant > disponible) {
      mostrarError(`Stock insuficiente. Disponible: ${disponible}`);
      return;
    }
    estado.totes[modelo] -= cant;
    descripcion = `Tote Bag ${modelo === 'silla' ? 'Reposera' : 'Vereda'}`;
    precio = PRECIOS.tote;
    _stock = { tipo: 'tote', modelo };
  }

  const pago = document.querySelector('input[name="pago"]:checked').value;
  const ingreso = pago === 'regalo' ? 0 : precio * cant;

  historial.unshift({
    id: Date.now(),
    fecha: new Date().toLocaleString('es-AR'),
    descripcion,
    cantidad: cant,
    ingreso,
    pago,
    precioUnit: precio,
    _stock,
  });

  guardar();
  renderTodo();
  modalVenta.classList.add('hidden');
});

function mostrarError(msg) {
  pError.textContent = msg;
  pError.classList.remove('hidden');
}

// ── Modal Historial ───────────────────────────────────────────────────────────
function buildResumen() {
  const cats = {};
  for (const h of historial) {
    const key = h.descripcion.startsWith('Remera Niñx') ? 'Niñx Reposera Roja'
               : h.descripcion.startsWith('Tote') ? h.descripcion
               : h.descripcion.match(/Remera (.+) talle/)
                 ? `Remera ${h.descripcion.match(/Remera (.+) talle/)[1]}`
                 : h.descripcion;
    if (!cats[key]) cats[key] = { unidades: 0, ingreso: 0 };
    cats[key].unidades += h.cantidad;
    cats[key].ingreso  += h.ingreso ?? 0;
  }
  return cats;
}

document.getElementById('btn-historial').addEventListener('click', () => {
  const contenedor = document.getElementById('lista-historial');
  const lblTotal = document.getElementById('historial-total-recaudado');
  const totalRecaudado = historial.reduce((s, h) => s + (h.ingreso ?? 0), 0);
  const totalUnidades  = historial.reduce((s, h) => s + h.cantidad, 0);

  if (historial.length === 0) {
    lblTotal.textContent = '';
    contenedor.innerHTML = '<p class="historial-vacio">Sin ventas registradas.</p>';
    document.getElementById('modal-historial').classList.remove('hidden');
    return;
  }

  const totalEfectivo      = historial.reduce((s, h) => s + (h.pago === 'efectivo'     ? (h.ingreso ?? 0) : 0), 0);
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

  const detalle = historial.map(h => `
    <div class="historial-item">
      <span class="hist-desc">${h.descripcion}</span>
      <span class="hist-cant">-${h.cantidad}</span>
      <span class="hist-ingreso">${h.ingreso ? formatPeso(h.ingreso) : ''}</span>
      <span class="hist-pago hist-pago--${h.pago ?? 'efectivo'}">${h.pago === 'transferencia' ? 'Transf.' : h.pago === 'regalo' ? '🎁 Regalo' : 'Efect.'}</span>
      <span class="hist-fecha">${h.fecha}</span>
      <span class="hist-acciones">
        <button class="btn-hist-edit" onclick="abrirEditar(${h.id})" title="Editar método de pago">✏️</button>
        <button class="btn-hist-del"  onclick="eliminarRegistro(${h.id})" title="Eliminar y devolver stock">🗑️</button>
      </span>
    </div>`).join('');

  contenedor.innerHTML = `
    <div class="resumen-section">
      <h3 class="resumen-titulo">Resumen por producto</h3>
      ${filas}
    </div>
    <h3 class="detalle-titulo">Detalle cronológico</h3>
    <div class="detalle-lista">${detalle}</div>
  `;

  document.getElementById('modal-historial').classList.remove('hidden');
});

document.getElementById('btn-cerrar-historial').addEventListener('click', () => {
  document.getElementById('modal-historial').classList.add('hidden');
});

// ── Editar / Eliminar registros ───────────────────────────────────────────────
let editandoId = null;
const modalEditar = document.getElementById('modal-editar');

window.abrirEditar = function(id) {
  const h = historial.find(x => x.id === id);
  if (!h) return;
  editandoId = id;
  document.getElementById('editar-desc').textContent =
    `${h.descripcion} — ${h.cantidad} u. — ${h.fecha}`;
  document.querySelectorAll('input[name="editar-pago"]').forEach(r => {
    r.checked = r.value === h.pago;
  });
  modalEditar.classList.remove('hidden');
};

document.getElementById('btn-confirmar-editar').addEventListener('click', () => {
  const h = historial.find(x => x.id === editandoId);
  if (!h) return;
  const nuevoPago = document.querySelector('input[name="editar-pago"]:checked').value;
  h.pago = nuevoPago;
  h.ingreso = nuevoPago === 'regalo' ? 0 : (h.precioUnit ?? 0) * h.cantidad;
  guardar();
  renderTodo();
  modalEditar.classList.add('hidden');
  // refrescar historial si sigue abierto
  document.getElementById('btn-historial').click();
});

document.getElementById('btn-cancelar-editar').addEventListener('click', () => {
  modalEditar.classList.add('hidden');
});

window.eliminarRegistro = function(id) {
  const idx = historial.findIndex(x => x.id === id);
  if (idx === -1) return;
  const h = historial[idx];
  const nombre = `${h.descripcion} (${h.cantidad} u.)`;
  if (!confirm(`¿Eliminar este registro y devolver el stock?\n\n${nombre}`)) return;

  // Restaurar stock (usa _stock guardado o infiere desde descripción)
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
  document.getElementById('btn-historial').click();
};

// Cerrar modales al hacer click afuera
[modalVenta, document.getElementById('modal-historial')].forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderTodo();
