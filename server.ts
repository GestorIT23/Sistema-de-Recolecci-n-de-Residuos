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
      const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbz6CPN7aKtMQPUuLhhGKEaaM7sikV7WF7VhqmNOTVTMa5IYP3wai5N_U_Gc2cfLcLNo3A/exec';
      
      console.log('--- PROXY REQUEST ---');
      console.log('Target GAS URL:', GAS_URL);

      if (!GAS_URL || GAS_URL.includes('AKfycbz_XXXXXXXXXXXX')) {
        console.error('GAS_WEBAPP_URL is not configured correctly');
        return res.status(500).json({ 
          success: false, 
          error: 'Configuración pendiente: Falta la URL de Google Apps Script válida.' 
        });
      }

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      
      const result = await response.json();
      console.log('GAS Response Success:', result.success);
      res.json(result);
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
