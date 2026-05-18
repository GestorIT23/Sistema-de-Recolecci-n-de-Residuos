/**
 * GOOGLE APPS SCRIPT BACKEND API
 * Despliegue: Implementar como Aplicación Web (Acceso: Cualquiera)
 */

const BIOTRASH_CONFIG = {
  SHEET_ID: '1cWmTWDTA-fyRGEuBVtUjstc6IuPXppfaTM2xvP-RFfM',
  FOLDER_ID: '169xhiKRk2sZ7SJLrzc4lROU40SDolKqJ',
  API_TOKEN: 'BIOTRASH_TOKEN_2024_SECURE'
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.token !== BIOTRASH_CONFIG.API_TOKEN) {
      return createResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (data.action === 'guardarRegistro') {
      return guardarRegistro(data.registro);
    }
    
    return createResponse({ success: false, error: 'Acción no válida: ' + data.action });
  } catch (error) {
    return createResponse({ success: false, error: 'Fallo en doPost: ' + error.toString() });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const token = e.parameter.token;

    if (token !== BIOTRASH_CONFIG.API_TOKEN) {
      return createResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (action === 'getRecords') {
      return getRecords();
    }

    return createResponse({ status: 'online', success: true });
  } catch (error) {
    return createResponse({ success: false, error: error.toString() });
  }
}

function setupSheet() {
  const ss = SpreadsheetApp.openById(BIOTRASH_CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName('Registros');
  
  if (!sheet) {
    sheet = ss.insertSheet('Registros');
    const headers = [
      'ID_REGISTRO', 'FECHA_SISTEMA', 'FECHA_LOCAL', 'USUARIO', 'ROL', 
      'CERTIFICADO_NO', 'CLIENTE', 'NO_TONEL', 'GRUPO', 'PRODUCTO', 
      'PROCESO', 'ESTADO', 'VOLUMEN_PERCENT', 'VOLUMEN_GALONES', 'VOLUMEN_TEXTO',
      'OBSERVACIONES', 'FOTO_VISTO_BUENO', 'FOTO_ETIQUETA', 'FOTO_GRUPO',
      'LATITUD', 'LONGITUD', 'ALTITUD', 'PRECISION', 'COORDENADAS',
      'URL_FIRMA', 'URL_PDF', 'TOKEN_VALIDATION'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#2e7d32').setFontColor('white').setFontWeight('bold');
  }
  return sheet;
}

function guardarRegistro(reg) {
  try {
    console.log('Iniciando guardado de registro: ' + (reg.no_reg || reg.id));
    const sheet = setupSheet();
    if (!sheet) throw new Error('No se pudo encontrar o crear la hoja "Registros"');

    const folderId = reg.driveFolderId || BIOTRASH_CONFIG.FOLDER_ID;
    console.log('Usando carpeta: ' + folderId);
    const folder = DriveApp.getFolderById(folderId);
    
    // Carpeta individual para el registro
    const folderName = `CERT_${reg.no_reg || reg.id || 'S_N'}_${reg.nombre_cliente || reg.cliente || 'S_C'}`.replace(/[\\/:*?"<>|]/g, '');
    const subFolder = folder.createFolder(folderName);
    console.log('Carpeta creada: ' + subFolder.getName());
    
    // Procesar Fotos
    const fVb = reg.foto_visto_bueno || (reg.fotos && reg.fotos.check) || '';
    const fEt = reg.foto_etiqueta || (reg.fotos && reg.fotos.etiqueta) || '';
    const fGr = reg.foto_grupo || (reg.fotos && reg.fotos.grupo) || '';

    const urlVb = fVb ? saveBase64File(fVb, `vb_${reg.no_reg}.jpg`, subFolder) : '';
    const urlEt = fEt ? saveBase64File(fEt, `et_${reg.no_reg}.jpg`, subFolder) : '';
    const urlGr = fGr ? saveBase64File(fGr, `gr_${reg.no_reg}.jpg`, subFolder) : '';
    
    // Firma y PDF
    // Almacenar el PDF en la raíz (folder) y el resto en la carpeta (subFolder)
    const savedPdfUrl = reg.pdf_base64 ? saveBase64File(reg.pdf_base64, `acta_${reg.no_reg || 'TEMP'}.pdf`, folder) : '';
    const savedFirmaUrl = reg.firma_base64 ? saveBase64File(reg.firma_base64, `firma_${reg.no_reg || 'TEMP'}.png`, subFolder) : '';

    const row = [
      reg.no_reg || reg.id || '',           // ID_REGISTRO
      new Date(),                           // FECHA_SISTEMA
      reg.fecha_local || reg.timestamp || '', // FECHA_LOCAL
      reg.usuario || reg.operador || '',     // USUARIO
      reg.usuario_rol || 'Operador',         // ROL
      reg.no_reg || reg.id || '',           // CERTIFICADO_NO
      reg.nombre_cliente || reg.cliente || '', // CLIENTE
      reg.no_tonel || reg.tonel || '',      // NO_TONEL
      reg.grupo || '',                      // GRUPO
      reg.producto_componente || reg.producto || '', // PRODUCTO
      reg.proceso_disposicion || reg.proceso || '',  // PROCESO
      reg.estado_recipiente || reg.estado || '',     // ESTADO
      reg.porc_vol_aprox || reg.porcentaje || '',    // VOLUMEN_PERCENT
      reg.galones_aprox || reg.galones || '',        // VOLUMEN_GALONES
      reg.volumen_completo || '',           // VOLUMEN_TEXTO
      reg.anomalias_obs || reg.observaciones || '', // OBSERVACIONES
      urlVb,                                // FOTO_VISTO_BUENO
      urlEt,                                // FOTO_ETIQUETA
      urlGr,                                // FOTO_GRUPO
      reg.latitud || '',                    // LATITUD
      reg.longitud || '',                   // LONGITUD
      reg.altitud || '',                    // ALTITUD
      reg.precision || reg.precision_m || '', // PRECISION
      reg.coordenadas || '',                 // COORDENADAS
      savedFirmaUrl,                        // URL_FIRMA
      savedPdfUrl,                          // URL_PDF
      reg.token || ''                       // TOKEN_VALIDATION
    ];
    
    console.log('Intentando appendRow...');
    sheet.appendRow(row);
    console.log('AppendRow exitoso.');

    return createResponse({ 
      success: true, 
      pdfUrl: savedPdfUrl, 
      no_reg: reg.no_reg,
      message: 'Registro almacenado correctamente en la fila ' + sheet.getLastRow()
    });
  } catch (e) {
    console.error('Error en guardarRegistro: ' + e.toString());
    return createResponse({ success: false, error: 'Error en guardarRegistro: ' + e.toString() });
  }
}

function saveBase64File(base64Data, filename, folder) {
  if (!base64Data || base64Data.length < 10) return '';
  try {
    const content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const decoded = Utilities.base64Decode(content);
    const blob = Utilities.newBlob(decoded, getMimeType(filename), filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return 'error_saving_file';
  }
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
