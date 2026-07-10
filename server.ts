import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const TG_BOT_TOKEN = "8735305943:AAGlV3cMV5pMuF6ef6EQzLMrirf4A-oQ79g";
const TG_CHAT_ID = "-1004222754940";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Safe Server-Side Telegram Sender Proxy
  app.post("/api/telegram/send", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        res.status(400).json({ error: "Missing message text" });
        return;
      }

      const telegramUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text: text,
          parse_mode: "HTML"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Telegram API response failed:", errorText);
        res.status(502).json({ error: "Telegram API failed", details: errorText });
        return;
      }

      const result = await response.json();
      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Error sending message to Telegram:", error);
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });

  // Server-Side Gemini Generative AI Proxy
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, systemInstruction, jsonSchema } = req.body;
      if (!prompt) {
        res.status(400).json({ error: "Missing prompt" });
        return;
      }

      // Check header or environment variable for Gemini key
      const clientKey = req.headers["x-gemini-key"] as string;
      const apiKey = clientKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        res.status(401).json({
          error: "Gemini API key is required. Set it in the AI Settings or environment."
        });
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const config: any = {};
      
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (jsonSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = jsonSchema;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: config
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini AI API calling error:", error);
      res.status(500).json({ error: error.message || "Generative request failed" });
    }
  });

  // Vite middleware setup in development, static folder mapping in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
