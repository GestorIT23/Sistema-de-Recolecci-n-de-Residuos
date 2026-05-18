import express from "express";
import path from "path";
import router from "./src/api";

const app = express();
app.use(express.json({ limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[SERVER] ${req.method} ${req.url}`);
  next();
});

// Use the same API router
app.use("/api", router);

async function setup() {
  const isDev = process.env.NODE_ENV !== "production";
  const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
  
  if (isDev) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server failed to load (expected in production if isDev is wrong):", e);
    }
  } else {
    // Production
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve index.html for all other routes (SPA fallback)
    app.get('*', (req, res, next) => {
      // Don't intercept API routes that might have missed the router
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          res.status(404).send("Front-end build not found. Please run 'npm run build' first.");
        }
      });
    });
  }

  if (!isVercel) {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://0.0.0.0:${PORT} (isDev: ${isDev})`);
    });
  } else {
    console.log("Running in Vercel environment - skipping app.listen()");
  }
}

// Global exception handlers to prevent deaths without logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

setup();

export default app;
