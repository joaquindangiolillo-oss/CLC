// ══════════════════════════════════════════════════════════════════════════════
// Cayo la Cabra — Script de sincronización (Google Apps Script)
// ══════════════════════════════════════════════════════════════════════════════
//
// INSTRUCCIONES DE CONFIGURACIÓN (hacelo UNA sola vez):
//
//  1. Abrí drive.google.com y creá una nueva Google Sheet (cualquier nombre).
//
//  2. En el menú de la planilla:
//       Extensiones → Apps Script
//
//  3. En el editor de Apps Script:
//       - Borrá TODO el código que aparece (function myFunction() {...})
//       - Pegá TODO el contenido de ESTE archivo (lo que ves acá)
//       - Guardá con Ctrl+S (o el ícono del disquete 💾)
//
//  4. Hacé clic en "Implementar" → "Nueva implementación"
//       - Tipo:              Aplicación web
//       - Descripción:       (cualquier cosa, ej: "CLC sync")
//       - Ejecutar como:     Yo (tu cuenta de Google)
//       - Quién tiene acceso: Cualquier persona (incluso anónimos)
//     Hacé clic en "Implementar"
//
//  5. Google te pedirá que autorices permisos → Aceptá.
//
//  6. Copiá la URL de implementación que aparece.
//     Tiene este formato:
//       https://script.google.com/macros/s/AKf.../exec
//
//  7. En la app (celular o PC):
//       - Tocá el botón ☁️ arriba a la derecha
//       - Pegá la URL
//       - Tocá "Guardar"
//     Listo — los datos se sincronizan automáticamente entre dispositivos.
//
// NOTA: Si modificás el script, tenés que hacer "Nueva implementación" de nuevo
//       (no "Gestionar implementaciones") para que los cambios tomen efecto.
// ══════════════════════════════════════════════════════════════════════════════

// Lee los datos guardados y los devuelve como JSON
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

// Recibe los datos de la app y los guarda en la planilla
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
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
