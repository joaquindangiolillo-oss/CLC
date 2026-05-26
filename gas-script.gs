// ══════════════════════════════════════════════════════════════════════════════
// Cayo la Cabra — Script de sincronización v2 (Google Apps Script)
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

      const stockRaw = stockSheet ? stockSheet.getRange('A1').getValue() : '';
      const histRaw  = histSheet  ? histSheet.getRange('A1').getValue()  : '';

      const result = {
        stock:     stockRaw ? JSON.parse(stockRaw) : null,
        historial: histRaw  ? JSON.parse(histRaw)  : null,
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

    if (body.stock !== undefined) {
      let sheet = ss.getSheetByName('Stock');
      if (!sheet) sheet = ss.insertSheet('Stock');
      sheet.getRange('A1').setValue(JSON.stringify(body.stock));
    }

    if (body.historial !== undefined) {
      let sheet = ss.getSheetByName('Historial');
      if (!sheet) sheet = ss.insertSheet('Historial');
      sheet.getRange('A1').setValue(JSON.stringify(body.historial));
      actualizarHojaVentas(ss, body.historial);
    }

    // Actualizar resumen con los datos más recientes
    const stockData   = body.stock     || leerJSON(ss, 'Stock',    '{}');
    const histData    = body.historial || leerJSON(ss, 'Historial', '[]');
    actualizarResumen(ss, stockData, histData);

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
    // Mover al frente
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }

  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['Fecha', 'Producto', 'Cant.', 'Precio unit. ($)', 'Total ($)', 'Pago'];
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  estilizarEncabezado(headerRange);

  if (!historial || historial.length === 0) {
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  const rows = historial.map(h => {
    const pago = h.pago === 'regalo'         ? '🎁 Regalo'
               : h.pago === 'transferencia'  ? 'Transferencia'
               :                               'Efectivo';
    return [
      h.fecha        || '',
      h.descripcion  || '',
      h.cantidad     || 0,
      h.precioUnit   || 0,
      h.ingreso      || 0,
      pago,
    ];
  });

  const dataRange = sheet.getRange(2, 1, rows.length, headers.length);
  dataRange.setValues(rows);

  // Zebra (filas alternadas) para legibilidad
  for (let i = 0; i < rows.length; i++) {
    sheet.getRange(i + 2, 1, 1, headers.length)
         .setBackground(i % 2 === 0 ? '#2a2a2a' : '#1c1c1c')
         .setFontColor('#e8e8e8');
  }

  // Formato moneda en columnas de precio
  sheet.getRange(2, 4, rows.length, 2).setNumberFormat('$#,##0');

  sheet.autoResizeColumns(1, headers.length);
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

  // ── Sección Ventas ───────────────────────────────────────────
  data.push(['VENTAS', '']);
  data.push(['Unidades vendidas',  totalUnid]);
  data.push(['Total recaudado',    totalRec]);
  data.push(['Efectivo',           totalEfec]);
  data.push(['Transferencia',      totalTrans]);
  data.push(['🎁 Regalos (u.)',    totalRegU]);
  data.push(['', '']);

  // ── Sección Stock ────────────────────────────────────────────
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

  // Estilizar filas de sección (VENTAS, STOCK ACTUAL, subtítulos)
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

  // Formato moneda en col B para filas de ventas ($)
  [2,3,4,5].forEach(r => {
    if (r <= 5) sheet.getRange(r, 2).setNumberFormat('$#,##0');
  });

  sheet.autoResizeColumns(1, 2);
}
