export async function sendTelegramMessage(text: string, taskId?: string): Promise<boolean> {
  const isDevOrPreview = 
    window.location.hostname === "localhost" || 
    window.location.hostname === "127.0.0.1" || 
    window.location.hostname.includes("run.app") || 
    window.location.hostname.includes("webcontainer") || 
    window.location.hostname.includes("aistudio");

  if (isDevOrPreview) {
    // 1. Inside Development / Preview Environments: ONLY use the Server-Side Express Proxy.
    // Never fall back to direct browser delivery here, which prevents the dual-delivery race condition
    // if the proxy request experiences latency.
    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text, taskId })
      });

      if (response.ok) {
        const data = await response.json();
        return !!data.success;
      }
      console.error("Express Telegram proxy returned non-OK status:", response.status);
      return false;
    } catch (error) {
      console.error("Express Telegram proxy request failed:", error);
      return false;
    }
  } else {
    // 2. Client-Side Only Production (e.g. GitHub Pages / static hosting): ONLY use direct Telegram API call.
    // There is no custom backend server running in static hosting, so we bypass the proxy request entirely.
    try {
      const TG_BOT_TOKEN = "8735305943:AAGlV3cMV5pMuF6ef6EQzLMrirf4A-oQ79g";
      const TG_CHAT_ID = "-1004222754940";
      
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
        console.error("Direct Telegram API failed:", errorText);
        return false;
      }

      const result = await response.json();
      return !!result.ok;
    } catch (fallbackError) {
      console.error("Failed to send Telegram message directly from browser:", fallbackError);
      return false;
    }
  }
}
