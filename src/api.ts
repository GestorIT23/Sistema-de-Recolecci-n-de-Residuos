import express from "express";
import axios from "axios";

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
    
    // Configurar URL destino
    const envUrl = (process.env.GAS_WEBAPP_URL || '').trim();
    
    // Si la URL del env existe pero no parece ser de Google (por ejemplo, si es la de Vercel por error)
    // usamos el fallback de Google.
    let finalUrl = envUrl;
    if (!finalUrl || !finalUrl.includes('script.google.com')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    }
    
    if (finalUrl.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    }

    log(`Target URL: ${finalUrl.substring(0, 60)}...`);

    try {
      const response = await axios({
        method: 'post',
        url: finalUrl,
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 28000, 
        validateStatus: () => true 
      });

      const status = response.status;
      const data = response.data;
      const duration = Date.now() - startTime;
      
      log(`Completed in ${duration}ms with status ${status}`);

      // Google suele devolver JSON si todo va bien, o HTML si hay error.
      // Axios parsea JSON automáticamente.
      if (status >= 400) {
        log(`Error from Google: ${status}`, data);
        return res.status(status).json({
          success: false,
          error: `Error ${status} de Google`,
          details: typeof data === 'object' ? JSON.stringify(data) : data.substring(0, 1000)
        });
      }

      res.status(status || 200).json(data);

    } catch (axiosError: any) {
      const duration = Date.now() - startTime;
      log(`Axios Error after ${duration}ms: ${axiosError.message}`);
      res.status(502).json({
        success: false,
        error: "Failed to communicate with Google Apps Script",
        code: axiosError.code,
        details: axiosError.message,
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
