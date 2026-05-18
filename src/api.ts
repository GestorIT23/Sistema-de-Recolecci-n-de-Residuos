import express from "express";

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
    const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbxNeJbViiUIe56V9X2dHl_d9h4V70PgE7Rmq-3D8jprKLcSkFmPxL68xyhI-i60D1gUqA/exec';
    
    let finalUrl = GAS_URL;
    if (!GAS_URL || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbxNeJbViiUIe56V9X2dHl_d9h4V70PgE7Rmq-3D8jprKLcSkFmPxL68xyhI-i60D1gUqA/exec';
    }

    const bodyStr = JSON.stringify(req.body);
    const sizeBytes = bodyStr.length;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    log(`Payload size: ${sizeMB.toFixed(2)} MB`);

    if (sizeMB > 4.4) {
      log("ABORT: Payload too large for Vercel/Proxy limit");
      return res.status(413).json({ success: false, error: 'Payload size exceeds 4.5MB limit.' });
    }

    // Simple fetch without AbortController for debugging 500
    try {
      log(`Forwarding to Google: ${finalUrl.substring(0, 60)}...`);
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: bodyStr,
        redirect: 'follow'
      });
      
      const status = response.status;
      const responseText = await response.text();
      const duration = Date.now() - startTime;
      
      log(`GAS Response: ${status} in ${duration}ms, body length: ${responseText.length}`);

      // Handle Redirects manually if needed (though redirect: 'follow' should work)
      if (status === 301 || status === 302) {
        log("Google requested a redirect that wasn't followed automatically?");
      }

      if (!response.ok && status !== 302 && status !== 301) {
        log(`ERROR: Google returned ${status}`);
        return res.status(status).json({
          success: false,
          error: `Google Apps Script returned status ${status}`,
          details: responseText.substring(0, 500) || 'No response body',
          duration,
          headers: Object.fromEntries(response.headers.entries())
        });
      }

      if (!responseText || responseText.trim() === '') {
        log("ERROR: Empty response from Google");
        return res.status(502).json({
          success: false,
          error: 'Google returned an empty body. Check your .gs code.',
          status,
          duration
        });
      }

      try {
        const result = JSON.parse(responseText);
        log("SUCCESS: Data saved successfully");
        res.json(result);
      } catch (e) {
        log("ERROR: Invalid JSON from Google", responseText.substring(0, 100));
        let errorMessage = 'The response from Google Apps Script was not valid JSON.';
        if (responseText.includes('google-signin') || responseText.includes('login')) {
          errorMessage = 'The script is restricted. Ensure "Execute as: Me" and "Who has access: Anyone".';
        } else if (responseText.includes('script-error') || responseText.includes('Exception')) {
          errorMessage = 'The Google Apps Script crashed during execution.';
        }

        res.status(502).json({ 
          success: false, 
          error: errorMessage, 
          status,
          rawBody: responseText.substring(0, 1000),
          duration
        });
      }
    } catch (fetchError: any) {
      const duration = Date.now() - startTime;
      log(`FETCH ERROR after ${duration}ms: ${fetchError.message}`);
      return res.status(500).json({ success: false, error: 'Network Error: ' + fetchError.message, duration });
    }
  } catch (error: any) {
    log(`CRITICAL ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: 'Internal Proxy Error: ' + error.message });
  }
});

export default router;
