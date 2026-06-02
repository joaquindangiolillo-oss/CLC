// ══════════════════════════════════════════════════════════════════════════════
// Cayo la Cabra — Script de sincronización v3 (Google Apps Script)
// ══════════════════════════════════════════════════════════════════════════════
//
// CÓMO ACTUALIZAR:
// 1. En el editor de Apps Script, reemplazá TODO el código con este archivo
// 2. Guardá (Ctrl+S o ícono del disquete 💾)
// 3. Implementar → Gestionar implementaciones → ✏️ editar la implementación
//    → "Versión": elegí "Nueva versión" → Implementar
// 4. En la app tocá ☁️ → "Subir datos ahora" para poblar las hojas
// ══════════════════════════════════════════════════════════════════════════════

// ── Lee los datos y los devuelve como JSON ────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'load';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (action === 'load') {
      const stockSheet = ss.getSheetByName('Stock');
      const histSheet  = ss.getSheetByName('Historial');
      const auditSheet = ss.getSheetByName('Auditorias');

      const stockRaw = stockSheet ? stockSheet.getRange('A1').getValue() : '';
      const histRaw  = histSheet  ? histSheet.getRange('A1').getValue()  : '';
      const auditRaw = auditSheet ? auditSheet.getRange('A1').getValue() : '';

      const pedidosSheet = ss.getSheetByName('Pedidos');
      const pedidosRaw   = pedidosSheet ? pedidosSheet.getRange('A1').getValue() : '';

      const result = {
        stock:      stockRaw    ? JSON.parse(stockRaw)    : null,
        historial:  histRaw     ? JSON.parse(histRaw)     : null,
        auditorias: auditRaw    ? JSON.parse(auditRaw)    : null,
        pedidos:    pedidosRaw  ? JSON.parse(pedidosRaw)  : null,
      };

      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Accion desconocida: ' + action }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Recibe datos de la app, guarda JSON y actualiza hojas legibles ─────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // Cada sección se guarda independientemente — un error en los helpers
    // no impide que las demás secciones se guarden
    if (body.stock !== undefined) {
      try {
        let sheet = ss.getSheetByName('Stock');
        if (!sheet) sheet = ss.insertSheet('Stock');
        sheet.getRange('A1').setValue(JSON.stringify(body.stock));
      } catch(e) { Logger.log('stock save error: ' + e); }
    }

    if (body.historial !== undefined) {
      try {
        let sheet = ss.getSheetByName('Historial');
        if (!sheet) sheet = ss.insertSheet('Historial');
        sheet.getRange('A1').setValue(JSON.stringify(body.historial));
      } catch(e) { Logger.log('historial save error: ' + e); }
      try { actualizarHojaVentas(ss, body.historial); } catch(e) { Logger.log('ventas sheet error: ' + e); }
      try { actualizarPorVariante(ss, body.historial); } catch(e) { Logger.log('variante sheet error: ' + e); }
    }

    if (body.auditorias !== undefined) {
      try {
        let sheet = ss.getSheetByName('Auditorias');
        if (!sheet) sheet = ss.insertSheet('Auditorias');
        sheet.getRange('A1').setValue(JSON.stringify(body.auditorias));
      } catch(e) { Logger.log('auditorias save error: ' + e); }
      try { actualizarHojaAuditorias(ss, body.auditorias); } catch(e) { Logger.log('audit sheet error: ' + e); }
    }

    if (body.pedidos !== undefined) {
      try {
        let sheet = ss.getSheetByName('Pedidos');
        if (!sheet) sheet = ss.insertSheet('Pedidos');
        sheet.getRange('A1').setValue(JSON.stringify(body.pedidos));
      } catch(e) { Logger.log('pedidos save error: ' + e); }
      try { actualizarHojaPedidos(ss, body.pedidos); } catch(e) { Logger.log('pedidos sheet error: ' + e); }
    }

    try {
      const stockData = body.stock     || leerJSON(ss, 'Stock',    '{}');
      const histData  = body.historial || leerJSON(ss, 'Historial', '[]');
      actualizarResumen(ss, stockData, histData);
    } catch(e) { Logger.log('resumen error: ' + e); }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Helper: leer JSON de una hoja ─────────────────────────────────────────────
function leerJSON(ss, nombreHoja, fallback) {
  try {
    const sheet = ss.getSheetByName(nombreHoja);
    const raw   = sheet ? sheet.getRange('A1').getValue() : '';
    return raw ? JSON.parse(raw) : JSON.parse(fallback);
  } catch (_) {
    return JSON.parse(fallback);
  }
}

// ── Helper: estilo de encabezado ──────────────────────────────────────────────
function estilizarEncabezado(range) {
  range.setFontWeight('bold')
       .setBackground('#1c1c1c')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');
}

// ── Hoja "📋 Ventas" — detalle de cada venta ──────────────────────────────────
function actualizarHojaVentas(ss, historial) {
  let sheet = ss.getSheetByName('📋 Ventas');
  if (!sheet) {
    sheet = ss.insertSheet('📋 Ventas');
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['Fecha', 'Producto', 'Cant.', 'Precio unit. ($)', 'Total ($)', 'Método de pago', 'Nombre (anota)'];
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  estilizarEncabezado(headerRange);

  if (!historial || historial.length === 0) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const rows = historial.map(h => {
    const pago = h.pago === 'regalo'        ? '🎁 Regalo'
               : h.pago === 'transferencia' ? 'Transferencia'
               : h.pago === 'anota'         ? '📝 Anota'
               :                              'Efectivo';
    const monto = h.pago === 'anota' ? (h.precioUnit || 0) * (h.cantidad || 1) : (h.ingreso || 0);
    return [
      h.fecha       || '',
      h.descripcion || '',
      h.cantidad    || 0,
      h.precioUnit  || 0,
      monto,
      pago,
      h.nombreAnota || '',
    ];
  });

  const dataRange = sheet.getRange(2, 1, rows.length, headers.length);
  dataRange.setValues(rows);

  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#2a2a2a' : '#1c1c1c';
    sheet.getRange(i + 2, 1, 1, headers.length).setBackground(bg).setFontColor('#e8e8e8');
  }

  sheet.getRange(2, 4, rows.length, 2).setNumberFormat('$#,##0');
  sheet.autoResizeColumns(1, headers.length);
}

// ── Hoja "✅ Auditorías" — historial de controles de stock ────────────────────
function actualizarHojaAuditorias(ss, auditorias) {
  let sheet = ss.getSheetByName('✅ Auditorías');
  if (!sheet) {
    sheet = ss.insertSheet('✅ Auditorías');
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(4);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['Fecha', 'Ítem ajustado', 'Antes', 'Después', 'Diferencia', 'Neto auditoría', 'Motivo', 'Descripción'];
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  estilizarEncabezado(headerRange);

  const arr = Array.isArray(auditorias) ? auditorias : [];
  if (arr.length === 0) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const rows = [];
  // Mostrar más reciente primero
  [...arr].reverse().forEach(a => {
    a.ajustes.forEach((aj, idx) => {
      rows.push([
        idx === 0 ? a.fecha : '',                          // fecha solo en la primera fila del grupo
        aj.desc,
        aj.anterior,
        aj.nuevo,
        aj.diff,
        idx === 0 ? a.diferenciaNeta : '',                 // neto solo en primera fila
        idx === 0 ? (a.motivo      || (a.diferenciaNeta === 0 ? '— redistribución —' : '')) : '',
        idx === 0 ? (a.motivoDetalle || '') : '',
      ]);
    });
  });

  if (rows.length === 0) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const dataRange = sheet.getRange(2, 1, rows.length, headers.length);
  dataRange.setValues(rows);

  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#2a2a2a' : '#1c1c1c';
    sheet.getRange(i + 2, 1, 1, headers.length).setBackground(bg).setFontColor('#e8e8e8');

    // Colorear columna diferencia (E)
    const diff = rows[i][4];
    if (diff !== '') {
      const cell = sheet.getRange(i + 2, 5);
      if (diff < 0)      cell.setFontColor('#e74c3c').setFontWeight('bold');
      else if (diff > 0) cell.setFontColor('#5dade2').setFontWeight('bold');
    }

    // Colorear columna neto (F)
    const neto = rows[i][5];
    if (neto !== '') {
      const cell = sheet.getRange(i + 2, 6);
      if (neto < 0)       cell.setFontColor('#e74c3c').setFontWeight('bold');
      else if (neto > 0)  cell.setFontColor('#5dade2').setFontWeight('bold');
      else                cell.setFontColor('#27ae60').setFontWeight('bold');
    }
  }

  sheet.autoResizeColumns(1, headers.length);
}

// ── Hoja "📈 Por variante" — ventas agrupadas por diseño/color/talle ──────────
function actualizarPorVariante(ss, historial) {
  let sheet = ss.getSheetByName('📈 Por variante');
  if (!sheet) {
    sheet = ss.insertSheet('📈 Por variante');
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(3);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const VARIANTES = ['reposeraRoja', 'reposeraNegra', 'blanca', 'veredaRoja', 'veredaNegra'];
  const TALLES    = ['S', 'M', 'L', 'XL', 'XXL'];
  const LABELS    = { reposeraRoja:'Reposera', reposeraNegra:'Reposera', blanca:'Blanca', veredaRoja:'Vereda', veredaNegra:'Vereda' };
  const COLORES   = { reposeraRoja:'Roja', reposeraNegra:'Negra', blanca:'—', veredaRoja:'Roja', veredaNegra:'Negra' };

  const ventasAdulto = {};
  VARIANTES.forEach(v => { ventasAdulto[v] = {}; TALLES.forEach(t => { ventasAdulto[v][t] = 0; }); });

  const ventasTote = { silla: 0, vereda: 0 };
  const ventasNino = {};

  const arr = Array.isArray(historial) ? historial : [];
  arr.forEach(h => {
    const s = h._stock;
    if (!s) return;
    const cant = h.cantidad || 1;
    if (s.tipo === 'adulto' && s.variante && s.talle) {
      if (ventasAdulto[s.variante]) ventasAdulto[s.variante][s.talle] = (ventasAdulto[s.variante][s.talle] || 0) + cant;
    } else if (s.tipo === 'tote' && s.modelo) {
      ventasTote[s.modelo] = (ventasTote[s.modelo] || 0) + cant;
    } else if (s.tipo === 'nino' && s.talle) {
      ventasNino[s.talle] = (ventasNino[s.talle] || 0) + cant;
    }
  });

  let row = 1;

  const headersAdulto = ['Diseño', 'Color', ...TALLES, 'Total'];
  const hrAdulto = sheet.getRange(row, 1, 1, headersAdulto.length);
  hrAdulto.setValues([headersAdulto]);
  estilizarEncabezado(hrAdulto);
  row++;

  VARIANTES.forEach((v, i) => {
    const talleVals = TALLES.map(t => ventasAdulto[v][t] || 0);
    const total     = talleVals.reduce((a, b) => a + b, 0);
    const rowData   = [LABELS[v], COLORES[v], ...talleVals, total];
    const r = sheet.getRange(row, 1, 1, rowData.length);
    r.setValues([rowData]);
    r.setBackground(i % 2 === 0 ? '#2a2a2a' : '#1c1c1c').setFontColor('#e8e8e8');
    row++;
  });

  const totalesTalle = TALLES.map(t => VARIANTES.reduce((s, v) => s + (ventasAdulto[v][t] || 0), 0));
  const totalAdulto  = totalesTalle.reduce((a, b) => a + b, 0);
  const filaTotal    = sheet.getRange(row, 1, 1, headersAdulto.length);
  filaTotal.setValues([['TOTAL', '', ...totalesTalle, totalAdulto]]);
  filaTotal.setFontWeight('bold').setFontColor('#27ae60').setBackground('#1c1c1c');
  row += 2;

  const hrTote = sheet.getRange(row, 1, 1, 2);
  hrTote.setValues([['Tote Bags', 'Vendidas']]);
  estilizarEncabezado(hrTote);
  row++;
  sheet.getRange(row,   1, 1, 2).setValues([['Reposera', ventasTote.silla  || 0]]).setBackground('#2a2a2a').setFontColor('#e8e8e8');
  sheet.getRange(row+1, 1, 1, 2).setValues([['Vereda',   ventasTote.vereda || 0]]).setBackground('#1c1c1c').setFontColor('#e8e8e8');
  row += 3;

  const hrNino = sheet.getRange(row, 1, 1, 2);
  hrNino.setValues([['Remera Niñx', 'Vendidas']]);
  estilizarEncabezado(hrNino);
  row++;
  [2,4,6,8,10,12,16].forEach((t, i) => {
    sheet.getRange(row, 1, 1, 2)
      .setValues([[`Talle ${t}`, ventasNino[String(t)] || 0]])
      .setBackground(i % 2 === 0 ? '#2a2a2a' : '#1c1c1c')
      .setFontColor('#e8e8e8');
    row++;
  });

  sheet.autoResizeColumns(1, headersAdulto.length);
}

// ── Hoja "📊 Resumen" — totales y stock actual ────────────────────────────────
function actualizarResumen(ss, stock, historial) {
  let sheet = ss.getSheetByName('📊 Resumen');
  if (!sheet) {
    sheet = ss.insertSheet('📊 Resumen');
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(2);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const arr = Array.isArray(historial) ? historial : [];

  const totalUnid  = arr.reduce((s, h) => s + (h.cantidad || 0), 0);
  const totalRec   = arr.reduce((s, h) => s + (h.ingreso  || 0), 0);
  const totalEfec  = arr.reduce((s, h) => h.pago === 'efectivo'      ? s + (h.ingreso || 0) : s, 0);
  const totalTrans = arr.reduce((s, h) => h.pago === 'transferencia' ? s + (h.ingreso || 0) : s, 0);
  const totalRegU  = arr.reduce((s, h) => h.pago === 'regalo'        ? s + h.cantidad        : s, 0);

  const VARIANTES = ['reposeraRoja', 'reposeraNegra', 'blanca', 'veredaRoja', 'veredaNegra'];
  const TALLES    = ['S', 'M', 'L', 'XL', 'XXL'];
  const LABELS    = {
    reposeraRoja:  'Reposera Roja',
    reposeraNegra: 'Reposera Negra',
    blanca:        'Blanca',
    veredaRoja:    'Vereda Roja',
    veredaNegra:   'Vereda Negra',
  };

  const data = [];

  data.push(['VENTAS', '']);
  data.push(['Unidades vendidas',  totalUnid]);
  data.push(['Total recaudado',    totalRec]);
  data.push(['Efectivo',           totalEfec]);
  data.push(['Transferencia',      totalTrans]);
  data.push(['🎁 Regalos (u.)',    totalRegU]);
  data.push(['', '']);

  data.push(['STOCK ACTUAL', '']);

  if (stock && stock.adultos) {
    data.push(['Remeras Adulto', '']);
    VARIANTES.forEach(v => {
      let total = 0;
      TALLES.forEach(t => { total += (stock.adultos[t] && stock.adultos[t][v]) || 0; });
      data.push(['  ' + LABELS[v], total]);
    });
    const totalAdulto = VARIANTES.reduce((sum, v) =>
      sum + TALLES.reduce((s, t) => s + ((stock.adultos[t] && stock.adultos[t][v]) || 0), 0), 0);
    data.push(['  TOTAL adulto', totalAdulto]);
    data.push(['', '']);
  }

  if (stock && stock.totes) {
    data.push(['Tote Bags', '']);
    data.push(['  Reposera', stock.totes.silla  || 0]);
    data.push(['  Vereda',   stock.totes.vereda || 0]);
    data.push(['  TOTAL totes', (stock.totes.silla || 0) + (stock.totes.vereda || 0)]);
    data.push(['', '']);
  }

  if (stock && stock.ninos) {
    data.push(['Remeras Niñx (Reposera Roja)', '']);
    [2, 4, 6, 8, 10, 12, 16].forEach(t => {
      data.push(['  Talle ' + t, stock.ninos[t] || 0]);
    });
    const totalNino = [2,4,6,8,10,12,16].reduce((s, t) => s + (stock.ninos[t] || 0), 0);
    data.push(['  TOTAL niñx', totalNino]);
  }

  sheet.getRange(1, 1, data.length, 2).setValues(data);

  data.forEach((row, i) => {
    const rowNum = i + 1;
    const cel = sheet.getRange(rowNum, 1, 1, 2);
    if (row[0] === 'VENTAS' || row[0] === 'STOCK ACTUAL') {
      estilizarEncabezado(cel);
    } else if (['Remeras Adulto', 'Tote Bags', 'Remeras Niñx (Reposera Roja)'].includes(row[0])) {
      cel.setFontWeight('bold').setBackground('#2a2a2a').setFontColor('#e8e8e8');
    } else if (row[0].includes('TOTAL')) {
      cel.setFontWeight('bold').setFontColor('#27ae60');
    } else if (row[0] !== '') {
      cel.setBackground('#1c1c1c').setFontColor('#e8e8e8');
    }
  });

  [2,3,4,5].forEach(r => {
    if (r <= 5) sheet.getRange(r, 2).setNumberFormat('$#,##0');
  });

  sheet.autoResizeColumns(1, 2);
}

// ── Hoja "📋 Pedidos" — tabla legible de pedidos ──────────────────────────────
function actualizarHojaPedidos(ss, pedidos) {
  let sheet = ss.getSheetByName('📋 Pedidos');
  if (!sheet) {
    sheet = ss.insertSheet('📋 Pedidos');
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(2);
  }
  sheet.clearContents();
  sheet.clearFormats();

  const headers = [
    'Fecha solicitud', 'Para quién', 'Ítem', 'Cant.',
    'Precio total ($)', 'Cobrado ($)', 'Saldo ($)',
    'Estado físico', 'Estado pago', 'Fecha entrega', 'Notas'
  ];
  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  estilizarEncabezado(hRange);

  if (!pedidos || pedidos.length === 0) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const estadoPagoLabel = (p) => {
    const pagado = (p.pagos || []).reduce((s, pg) => s + pg.monto, 0);
    const saldo  = (p.precioTotal || 0) - pagado;
    if (saldo <= 0) return 'Pagado';
    if (pagado > 0) return 'Seña parcial';
    return 'Sin pago';
  };

  const itemDesc = (p) => {
    if (p.tipo === 'adulto') return (p.variante || '') + ' talle ' + (p.talle || '');
    if (p.tipo === 'tote')   return 'Tote Bag ' + (p.modelo === 'silla' ? 'Reposera' : 'Vereda');
    if (p.tipo === 'nino')   return 'Remera Niñx talle ' + (p.talle || '');
    return '';
  };

  const estadoLabel = { solicitud: 'Solicitud', armado: 'Armado', entregado: 'Entregado', cancelado: 'Cancelado' };

  const rows = [...pedidos].reverse().map(p => {
    const pagado = (p.pagos || []).reduce((s, pg) => s + pg.monto, 0);
    const saldo  = (p.precioTotal || 0) - pagado;
    return [
      p.fecha        || '',
      p.para         || '',
      itemDesc(p),
      p.cantidad     || 1,
      p.precioTotal  || 0,
      pagado,
      saldo,
      estadoLabel[p.estadoFisico] || p.estadoFisico || '',
      estadoPagoLabel(p),
      p.fechaEntrega || '',
      p.notas        || '',
    ];
  });

  if (rows.length > 0) {
    const dRange = sheet.getRange(2, 1, rows.length, headers.length);
    dRange.setValues(rows);
    // Color rows by estado
    rows.forEach((row, i) => {
      const estado = pedidos[pedidos.length - 1 - i]?.estadoFisico;
      const bg = estado === 'entregado' ? '#1a2e1a'
               : estado === 'armado'    ? '#1a2233'
               : estado === 'cancelado' ? '#2a2020'
               :                          (i % 2 === 0 ? '#2a2a2a' : '#1c1c1c');
      sheet.getRange(i + 2, 1, 1, headers.length).setBackground(bg).setFontColor('#e8e8e8');
    });
    // Format money columns
    sheet.getRange(2, 5, rows.length, 3).setNumberFormat('$#,##0');
    // Highlight saldo > 0 in red
    rows.forEach((row, i) => {
      if (row[6] > 0) sheet.getRange(i + 2, 7).setFontColor('#e74c3c').setFontWeight('bold');
    });
  }

  sheet.autoResizeColumns(1, headers.length);
}
