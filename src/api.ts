import express from "express";
import axios from "axios";

const router = express.Router();

// Helper to log with timestamp
const log = (msg: string, data?: any) => {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[API ${time}] ${msg}`, data || '');
};

// Health check
router.get("/health", (req, res) => {
  log("GET /health");
  res.json({ 
    status: "ok", 
    vercel: !!process.env.VERCEL, 
    node: process.version,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// API Proxy to Google Apps Script
router.post("/save", async (req, res) => {
  const startTime = Date.now();
  log("POST /save - Started");
  
  try {
    const rawUrl = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbxNeJbViiUIe56V9X2dHl_d9h4V70PgE7Rmq-3D8jprKLcSkFmPxL68xyhI-i60D1gUqA/exec';
    
    // Trim and clean URL
    const GAS_URL = rawUrl.trim();
    
    let finalUrl = GAS_URL;
    if (!GAS_URL || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    }

    const payload = req.body;
    const bodyStr = JSON.stringify(payload);
    const sizeBytes = bodyStr.length;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    log(`Payload size: ${sizeBytes} bytes (${sizeMB.toFixed(2)} MB)`);

    if (sizeMB > 4.4) {
      log("ABORT: Payload too large for Vercel/Proxy limit");
      return res.status(413).json({ success: false, error: 'Payload too large (>4.5MB)' });
    }

    log(`Forwarding to Google: ${finalUrl.substring(0, 60)}...`);

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
        timeout: 25000, // 25 seconds timeout
        validateStatus: () => true // Handle all status codes
      });

      const status = response.status;
      const data = response.data;
      const duration = Date.now() - startTime;
      
      log(`GAS Response: ${status} in ${duration}ms`);

      if (status >= 400) {
        log(`ERROR: Google returned ${status}`, data);
        return res.status(status).json({
          success: false,
          error: `Google Apps Script returned status ${status}`,
          details: typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data),
          duration
        });
      }

      // Google Apps Script usually returns JSON or HTML error
      if (!data) {
        log("ERROR: Empty response from Google");
        return res.status(502).json({
          success: false,
          error: 'Empty response from Google Apps Script',
          status,
          duration
        });
      }

      // Axios automatically parses JSON if possible
      log("SUCCESS: Request completed");
      res.status(status).json(data);

    } catch (axiosError: any) {
      const duration = Date.now() - startTime;
      log(`AXIOS ERROR after ${duration}ms: ${axiosError.message}`);
      
      if (axiosError.code === 'ECONNABORTED') {
        return res.status(504).json({ success: false, error: 'TIMEOUT_25S_GAS', duration });
      }

      return res.status(500).json({ 
        success: false, 
        error: 'Proxy Fetch Error: ' + axiosError.message,
        code: axiosError.code,
        duration 
      });
    }
  } catch (error: any) {
    log(`CRITICAL PROXY ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: 'Internal logic crash: ' + error.message });
  }
});

export default router;
