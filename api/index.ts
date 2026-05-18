import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ limit: '50mb' }));

const log = (msg: string, data?: any) => {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[VERCEL-API ${time}] ${msg}`, data ? (typeof data === 'object' ? 'OBJ' : data) : '');
};

app.post("/api/save", async (req, res) => {
  const startTime = Date.now();
  const payload = req.body;
  
  log("Save Request Started");

  const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbwk1Mt8CXpH1BhgTIbXsD6ikH_9B0c2swZlHC2qbDL2kkB8waU0Jo4eJT4cXJ0yvJOoNw/exec';

  try {
    const response = await axios({
      method: 'post',
      url: GAS_URL,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 25000,
      validateStatus: () => true
    });

    const duration = Date.now() - startTime;
    log(`Google Response: ${response.status} in ${duration}ms`);

    res.status(response.status).json(response.data);
  } catch (err: any) {
    const duration = Date.now() - startTime;
    log(`Error: ${err.message}`);
    res.status(502).json({
      success: false,
      error: "Communication error with Google",
      details: err.message,
      duration
    });
  }
});

// Fallback for health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: "vercel" });
});

export default app;
