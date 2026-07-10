export async function sendTelegramMessage(text: string): Promise<boolean> {
  // First, try sending through the Express server-side proxy
  try {
    const response = await fetch("/api/telegram/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    if (response.ok) {
      const data = await response.json();
      return !!data.success;
    }
    console.warn("Express Telegram proxy returned non-OK status. Falling back to direct client-side delivery...");
  } catch (error) {
    console.warn("Express Telegram proxy unreachable. Falling back to direct client-side delivery...", error);
  }

  // Client-side fallback: direct call to Telegram API
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
