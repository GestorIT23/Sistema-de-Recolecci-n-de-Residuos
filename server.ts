import express from "express";
import path from "path";

const app = express();
app.use(express.json({ limit: '10mb' })); 

// Proxy logo to avoid CORS
app.get("/api/logo-proxy", async (req, res) => {
  const fallbackUrls = [
    'https://i.ibb.co/vzrQ6vW/logo-biotrash.png',
    'https://drive.google.com/thumbnail?id=1qHSIj7ONXw5S8j246GXZA2_fk46H3VGW&sz=w1000'
  ];
  
  for (const url of fallbackUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.set("Content-Type", "image/png");
        return res.send(Buffer.from(buffer));
      }
    } catch (error) {
      console.error(`Failed to load logo from ${url}:`, error);
    }
  }
  res.status(404).send('Logo not found');
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", vercel: !!process.env.VERCEL, env: process.env.NODE_ENV });
});

// API Proxy to Google Apps Script
app.post("/api/save", async (req, res) => {
  try {
    const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycby41-qUvWKpTSh2AzPHRtcCggDNINs8LGSbUJ4zdo-Z4KkM-tWPjzN_gML9GnUHjUXFgQ/exec';
    
    let finalUrl = GAS_URL;
    if (GAS_URL.includes('vercel.app') || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
      finalUrl = 'https://script.google.com/macros/s/AKfycby41-qUvWKpTSh2AzPHRtcCggDNINs8LGSbUJ4zdo-Z4KkM-tWPjzN_gML9GnUHjUXFgQ/exec';
    }

    const bodyStr = JSON.stringify(req.body);
    const sizeMB = bodyStr.length / (1024 * 1024);
    console.log(`--- PROXY REQUEST (Size: ${sizeMB.toFixed(2)} MB) ---`);
    
    // Vercel has a 4.5MB limit for serverless function payloads
    if (sizeMB > 4.4) {
      return res.status(413).json({ 
        success: false, 
        error: `Payload too large (${sizeMB.toFixed(2)}MB). Limit is 4.5MB.` 
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s timeout for Vercel compatibility

    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        redirect: 'follow',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseText = await response.text();
      
      try {
        const result = JSON.parse(responseText);
        res.json(result);
      } catch (e) {
        res.status(500).json({ 
          success: false, 
          error: 'La respuesta de Google Apps Script no fue un JSON válido.',
          details: responseText.substring(0, 200)
        });
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'Tiempo de espera agotado con Google Apps Script (9s).' });
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('Proxy Error Detail:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error de conexión con Google: ' + error.message 
    });
  }
});

async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Start server if this file is run directly (not via Vercel)
if (process.env.NODE_ENV !== "production") {
  setupVite().then(() => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
} else if (!process.env.VERCEL) {
  // Production but not Vercel (e.g. local preview or custom server)
  setupVite().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Production server running on port ${PORT}`);
    });
  });
}
// En Vercel no llamamos a app.listen ni a setupVite obligatoriamente aquí
// ya que las rutas de API se registran arriba y los archivos estáticos
// los maneja Vercel mediante vercel.json.

export default app;
