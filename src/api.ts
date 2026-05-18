import express from "express";
import https from "node:https";
import url from "node:url";

const router = express.Router();

const log = (msg: string, data?: any) => {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[API ${time}] ${msg}`, data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data) : '');
};

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.post("/save", async (req, res) => {
  const startTime = Date.now();
  log("POST /save - Started");
  
  try {
    const payload = req.body;
    const bodyStr = JSON.stringify(payload);
    
    // Configurar URL destino
    const envUrl = (process.env.GAS_WEBAPP_URL || '').trim();
    // Prioridad: 1. Env Var, 2. URL específica del usuario, 3. Fallback genérico
    let finalUrl = envUrl || 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    
    if (finalUrl.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    }

    log(`Target URL: ${finalUrl.substring(0, 60)}...`);
    log(`Payload size: ${bodyStr.length} bytes`);

    // Función recursiva para manejar redireccionamientos manuales si es necesario (GAS lo requiere)
    const performRequest = (requestUrl: string, depth = 0): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (depth > 5) return reject(new Error("Too many redirects"));

        const parsedUrl = url.parse(requestUrl);
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
            'User-Agent': 'Mozilla/5.0 (Node.js Proxy)'
          },
          timeout: 25000
        };

        const reqOut = https.request(options, (resIn) => {
          // Manejar Redirecciones (GAS usa 302 siempre)
          if (resIn.statusCode === 301 || resIn.statusCode === 302) {
            const redirectUrl = resIn.headers.location;
            if (redirectUrl) {
              log(`Redirecting (${resIn.statusCode}) to: ${redirectUrl.substring(0, 50)}...`);
              // Nota: Al redireccionar GAS de POST a GET en la nueva URL, a veces hay que cambiar el método
              // Pero GAS usualmente acepta el POST en la redirección o maneja el doPost.
              // En Node, fetch/axios manejan esto bien. Con https manual, probamos seguir el flujo.
              return resolve(performRequest(redirectUrl, depth + 1));
            }
          }

          let data = '';
          resIn.on('data', (chunk) => { data += chunk; });
          resIn.on('end', () => {
            resolve({
              status: resIn.statusCode,
              headers: resIn.headers,
              body: data
            });
          });
        });

        reqOut.on('error', (err) => reject(err));
        reqOut.on('timeout', () => {
          reqOut.destroy();
          reject(new Error("Timeout after 25s"));
        });

        reqOut.write(bodyStr);
        reqOut.end();
      });
    };

    try {
      const result = await performRequest(finalUrl);
      const duration = Date.now() - startTime;
      log(`Completed in ${duration}ms with status ${result.status}`);

      // Intentar parsear como JSON
      try {
        const json = JSON.parse(result.body);
        res.status(result.status || 200).json(json);
      } catch (e) {
        // Si no es JSON, enviarlo como texto/error
        if (result.status >= 400) {
          res.status(result.status).json({
            success: false,
            error: `Error ${result.status} de Google (No JSON)`,
            details: result.body.substring(0, 1000)
          });
        } else {
          // A veces GAS devuelve éxito pero con un mensaje de texto "Success"
          res.status(result.status || 200).json({
            success: true,
            message: "Request completed, but response was not JSON",
            raw: result.body.substring(0, 500)
          });
        }
      }
    } catch (reqError: any) {
      const duration = Date.now() - startTime;
      log(`Request error: ${reqError.message}`);
      res.status(502).json({
        success: false,
        error: "Failed to communicate with Google Apps Script",
        details: reqError.message,
        duration
      });
    }
  } catch (error: any) {
     log(`Fatal proxy error: ${error.message}`);
     res.status(500).json({
       success: false,
       error: "Internal proxy logic crash",
       details: error.message
     });
  }
});

export default router;
