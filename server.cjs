var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var TG_BOT_TOKEN = "8735305943:AAGlV3cMV5pMuF6ef6EQzLMrirf4A-oQ79g";
var TG_CHAT_ID = "-1004222754940";
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  const sentTaskIds = /* @__PURE__ */ new Set();
  app.post("/api/telegram/send", async (req, res) => {
    try {
      const { text, taskId } = req.body;
      if (!text) {
        res.status(400).json({ error: "Missing message text" });
        return;
      }
      if (taskId) {
        if (sentTaskIds.has(taskId)) {
          console.log(`[Deduplication] Blocked duplicate Telegram alert for task ID: ${taskId}`);
          res.json({ success: true, duplicated: true });
          return;
        }
        sentTaskIds.add(taskId);
        setTimeout(() => {
          sentTaskIds.delete(taskId);
        }, 60 * 60 * 1e3);
      }
      const telegramUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text,
          parse_mode: "HTML"
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Telegram API response failed:", errorText);
        if (taskId) {
          sentTaskIds.delete(taskId);
        }
        res.status(502).json({ error: "Telegram API failed", details: errorText });
        return;
      }
      const result = await response.json();
      res.json({ success: true, result });
    } catch (error) {
      console.error("Error sending message to Telegram:", error);
      if (req.body.taskId) {
        sentTaskIds.delete(req.body.taskId);
      }
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, systemInstruction, jsonSchema } = req.body;
      if (!prompt) {
        res.status(400).json({ error: "Missing prompt" });
        return;
      }
      const clientKey = req.headers["x-gemini-key"];
      const apiKey = clientKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(401).json({
          error: "Gemini API key is required. Set it in the AI Settings or environment."
        });
        return;
      }
      const ai = new import_genai.GoogleGenAI({ apiKey });
      const config = {};
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
        config
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("Gemini AI API calling error:", error);
      res.status(500).json({ error: error.message || "Generative request failed" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
