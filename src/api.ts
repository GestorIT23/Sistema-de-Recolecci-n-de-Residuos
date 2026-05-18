import express from "express";

const router = express.Router();

// Proxy logo to avoid CORS
router.get("/logo-proxy", async (req, res) => {
  const fallbackUrls = [
    'https://i.ibb.co/vzrQ6vW/logo-biotrash.png',
    'https://i.postimg.cc/mD8D9h6V/logo-biotrash.png',
    'https://biotrash.net/wp-content/uploads/2021/04/logo-biotrash.png'
  ];
  
  const diagnostic: any[] = [];
  for (const url of fallbackUrls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(id);

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.set("Content-Type", "image/png");
        res.set("Cache-Control", "public, max-age=86400");
        res.set("Access-Control-Allow-Origin", "*");
        return res.send(Buffer.from(buffer));
      } else {
        diagnostic.push({ url, status: response.status });
      }
    } catch (error: any) {
      diagnostic.push({ url, error: error.message });
    }
  }
  console.error('Logo Proxy failure:', diagnostic);
  res.status(502).json({ error: 'Logo not found', diagnostic });
});

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", vercel: !!process.env.VERCEL, node: process.version });
});

// API Proxy to Google Apps Script
router.post("/save", async (req, res) => {
  const startTime = Date.now();
  try {
    const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    
    let finalUrl = GAS_URL;
    if (!GAS_URL || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';
    }

    const bodyStr = JSON.stringify(req.body);
    const sizeMB = bodyStr.length / (1024 * 1024);
    
    if (sizeMB > 4.4) {
      return res.status(413).json({ success: false, error: 'Payload too large (>4.5MB)' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9500); // Increased a bit

    try {
      console.log(`Sending to GAS: ${finalUrl.substring(0, 50)}...`);
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Vercel Serverless)'
        },
        body: bodyStr,
        redirect: 'follow',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const status = response.status;
      const responseText = await response.text();
      const duration = Date.now() - startTime;
      
      console.log(`GAS Response: ${status} in ${duration}ms, body length: ${responseText.length}`);

      if (!response.ok && status !== 302 && status !== 301) {
        return res.status(status).json({
          success: false,
          error: `Google returned error status ${status}`,
          details: responseText.substring(0, 500) || 'No response body',
          duration,
          headers: Object.fromEntries(response.headers.entries())
        });
      }

      if (!responseText || responseText.trim() === '') {
        return res.status(502).json({
          success: false,
          error: 'Google returned an empty response. Ensure the GAS script uses ContentService to return data.',
          status,
          duration,
          headers: Object.fromEntries(response.headers.entries())
        });
      }

      try {
        const result = JSON.parse(responseText);
        res.json(result);
      } catch (e) {
        // If it's not JSON, it might be an HTML error page from Google
        let errorMessage = 'Invalid JSON from Google';
        if (responseText.includes('google-signin') || responseText.includes('login')) {
          errorMessage = 'Google Apps Script requires authentication. Ensure it is deployed as "Anyone".';
        } else if (responseText.includes('script-error')) {
          errorMessage = 'Google Apps Script encountered a script error.';
        }

        res.status(502).json({ 
          success: false, 
          error: errorMessage, 
          status,
          rawBody: responseText.substring(0, 1000), // Give more info
          duration
        });
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'TIMEOUT_9.5S', duration });
      }
      return res.status(500).json({ success: false, error: 'Fetch Error: ' + fetchError.message, duration });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

export default router;
