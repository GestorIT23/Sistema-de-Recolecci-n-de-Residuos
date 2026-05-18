import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // API Proxy to Google Apps Script (to avoid CORS and opaque responses)
  app.post("/api/save", async (req, res) => {
    try {
      const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbz1pSqNHxiiVHGfSPEidCbGn_24YU1MSmxv5jjTaHu0GD5WiVosZJ9qntr8jH2twnND5g/exec';
      
      // If the URL in env is the Vercel one or the placeholder, use the user's provided Google URL
      let finalUrl = GAS_URL;
      if (GAS_URL.includes('vercel.app') || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
        finalUrl = 'https://script.google.com/macros/s/AKfycby41-qUvWKpTSh2AzPHRtcCggDNINs8LGSbUJ4zdo-Z4KkM-tWPjzN_gML9GnUHjUXFgQ/exec';
      }

      console.log('--- PROXY REQUEST ---');
      console.log('Target URL:', finalUrl);

      console.log('2. Sending to GAS...');
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        redirect: 'follow'
      });
      
      const responseText = await response.text();
      console.log('3. GAS Response received, status:', response.status);

      try {
        const result = JSON.parse(responseText);
        console.log('GAS Response Success:', result.success);
        res.json(result);
      } catch (e) {
        console.error('Failed to parse GAS response as JSON. Content:', responseText);
        res.status(500).json({ 
          success: false, 
          error: 'La respuesta de Google Apps Script no fue un JSON válido. Revisa el registro de ejecución de Apps Script.',
          details: responseText.substring(0, 200)
        });
      }
    } catch (error: any) {
      console.error('Proxy Error Detail:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error de conexión con Google: ' + error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
