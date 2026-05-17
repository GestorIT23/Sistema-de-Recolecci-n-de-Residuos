/**
 * GOOGLE APPS SCRIPT BACKEND API
 * Despliegue: Implementar como Aplicación Web (Acceso: Cualquiera)
 */

const CONFIG = {
  SHEET_ID: '1cWmTWDTA-fyRGEuBVtUjstc6IuPXppfaTM2xvP-RFfM',
  FOLDER_ID: '1pAEWWnzI-Np8oqryt5Y6bepZI938V7sc',
  API_TOKEN: 'biotrash_key_2026' // Simple token match
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Validar token
    if (data.token !== CONFIG.API_TOKEN) {
      return createResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const action = data.action;
    
    if (action === 'guardarRegistro') {
      return guardarRegistro(data.registro);
    }
    
    return createResponse({ success: false, error: 'Acción no válida' });
  } catch (error) {
    return createResponse({ success: false, error: error.toString() });
  }
}

function doGet(e) {
  try {
    // Para validación de No. REG o inventario
    const action = e.parameter.action;
    const token = e.parameter.token;

    if (token !== CONFIG.API_TOKEN) {
      return createResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (action === 'getRecords') {
      return getRecords();
    }

    return createResponse({ status: 'online', version: '1.0.0' });
  } catch (error) {
    return createResponse({ success: false, error: error.toString() });
  }
}

function setupSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('Registros');
  
  if (!sheet) {
    sheet = ss.insertSheet('Registros');
    const headers = [
      'FECHA_HORA', 'USUARIO_CREACION', 'NO_REG', 'NOMBRE_CLIENTE', 'NO_TONEL', 
      'PRODUCTO_COMPONENTE', 'GRUPO', 'PROCESO_DISPOSICION', 'ESTADO_RECIPIENTE', 
      'PORC_VOL_APROX', 'GALONES_APROX', 'FOTO_CHECK_URL', 'FOTO_ETIQUETA_URL', 
      'FOTO_GRUPO_URL', 'LATITUD', 'LONGITUD', 'ALTITUD', 'PRECISION_M', 
      'ANOMALIAS_OBS', 'FIRMA_BASE64', 'FIRMA_URL', 'URL_PDF', 'URL_QR', 
      'FECHA_REGENERACION', 'REGENERADO_POR'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    
    // Validaciones
    const groupRule = SpreadsheetApp.newDataValidation().requireNumberBetween(1, 10).build();
    sheet.getRange('G2:G1000').setDataValidation(groupRule);
    
    const procRule = SpreadsheetApp.newDataValidation().requireValueInList(['Desnaturalización', 'Incineración']).build();
    sheet.getRange('H2:H1000').setDataValidation(procRule);
    
    const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(['Buen Estado', 'Mal Estado', 'Presenta Derrame', 'No Transportable']).build();
    sheet.getRange('I2:I1000').setDataValidation(statusRule);
  }
  return sheet;
}

function guardarRegistro(reg) {
  const sheet = setupSheet();
  const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  
  // Crear subcarpeta para el registro
  const subFolderName = `${reg.no_reg}_${reg.nombre_cliente}`.replace(/[\\/:*?"<>|]/g, '');
  const subFolder = folder.createFolder(subFolderName);
  
  // Guardar Fotos
  const urlCheck = saveBase64File(reg.fotos.check, `check_${reg.no_reg}.jpg`, subFolder);
  const urlEtiqueta = saveBase64File(reg.fotos.etiqueta, `etiqueta_${reg.no_reg}.jpg`, subFolder);
  const urlGrupo = saveBase64File(reg.fotos.grupo, `grupo_${reg.no_reg}.jpg`, subFolder);
  
  // Guardar Firma
  const urlFirma = saveBase64File(reg.firma_base64, `firma_${reg.no_reg}.png`, subFolder);
  
  // Guardar PDF
  const urlPdf = saveBase64File(reg.pdf_base64, `acta_${reg.no_reg}.pdf`, subFolder);

  const row = [
    new Date(),
    reg.usuario_rol,
    reg.no_reg,
    reg.nombre_cliente,
    reg.no_tonel,
    reg.producto_componente,
    reg.grupo,
    reg.proceso_disposicion,
    reg.estado_recipiente,
    reg.porc_vol_aprox,
    reg.galones_aprox,
    urlCheck,
    urlEtiqueta,
    urlGrupo,
    reg.latitud,
    reg.longitud,
    reg.altitud || '',
    reg.precision_m,
    reg.anomalias_obs || '',
    reg.firma_base64.substring(0, 50) + '...', // No guardar base64 completo en celda por limite de caracteres
    urlFirma,
    urlPdf,
    '', // QR link (el frontend ya lo incluyó en el PDF)
    '', ''
  ];
  
  sheet.appendRow(row);
  
  // Formato condicional de precisión se haría manual en Sheets o via script
  return createResponse({ success: true, urlPdf: urlPdf, no_reg: reg.no_reg });
}

function saveBase64File(base64Data, filename, folder) {
  if (!base64Data) return '';
  const decoded = Utilities.base64Decode(base64Data.split(',')[1]);
  const blob = Utilities.newBlob(decoded, getMimeType(filename), filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getMimeType(filename) {
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function createResponse(obj, code = 200) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getRecords() {
  const sheet = setupSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const jsonRows = data.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return createResponse({ success: true, data: jsonRows });
}
