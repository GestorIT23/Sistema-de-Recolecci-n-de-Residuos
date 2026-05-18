import express from "express";

const router = express.Router();

// Proxy logo to avoid CORS
router.get("/logo-proxy", async (req, res) => {
  const fallbackUrls = [
    'https://i.ibb.co/vzrQ6vW/logo-biotrash.png',
    'https://i.postimg.cc/mD8D9h6V/logo-biotrash.png',
    'https://drive.google.com/thumbnail?id=1qHSIj7ONXw5S8j246GXZA2_fk46H3VGW&sz=w1000'
  ];
  
  const errors: string[] = [];
  for (const url of fallbackUrls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.set("Content-Type", "image/png");
        res.set("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(buffer));
      } else {
        errors.push(`${url}: status ${response.status}`);
      }
    } catch (error: any) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  console.error('Logo Proxy failure:', errors);
  res.status(502).json({ error: 'Logo not found', details: errors });
});

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", vercel: !!process.env.VERCEL, node: process.version });
});

// API Proxy to Google Apps Script
router.post("/save", async (req, res) => {
  const startTime = Date.now();
  try {
    const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycby41-qUvWKpTSh2AzPHRtcCggDNINs8LGSbUJ4zdo-Z4KkM-tWPjzN_gML9GnUHjUXFgQ/exec';
    
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
          'Accept': 'application/json'
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

      if (!response.ok && status !== 302) {
        return res.status(status).json({
          success: false,
          error: `Google returned status ${status}`,
          details: responseText.substring(0, 100),
          duration
        });
      }

      if (!responseText) {
        return res.status(502).json({
          success: false,
          error: 'Empty response from Google',
          status,
          duration
        });
      }

      try {
        const result = JSON.parse(responseText);
        res.json(result);
      } catch (e) {
        res.status(502).json({ 
          success: false, 
          error: 'Invalid JSON from Google', 
          status,
          details: responseText.substring(0, 100),
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
