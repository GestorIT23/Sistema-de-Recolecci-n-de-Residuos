import express from "express";
import router from "../src/api";

const app = express();
app.use(express.json({ limit: '10mb' }));

// Logging for Vercel debugging
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.use("/api", router);
app.use("/", router); // Fallback for various Vercel mount points

export default app;
