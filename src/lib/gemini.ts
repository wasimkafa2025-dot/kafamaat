export async function callGeminiProxy(prompt: string, options: { systemInstruction?: string; jsonSchema?: any } = {}): Promise<string | null> {
  const localKey = localStorage.getItem("taskflow_gemini_api_key") || "";
  
  // First, try sending through the Express server-side proxy
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (localKey) {
      headers["x-gemini-key"] = localKey;
    }

    const response = await fetch("/api/gemini/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        systemInstruction: options.systemInstruction,
        jsonSchema: options.jsonSchema
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.text || null;
    }
    console.warn("Express Gemini proxy returned non-OK status. Falling back to direct client-side Gemini API...");
  } catch (error) {
    console.warn("Express Gemini proxy unreachable. Falling back to direct client-side Gemini API...", error);
  }

  // Client-side fallback: Call Google Gemini API directly from the browser
  let activeKey = localKey;
  if (!activeKey) {
    const userKey = window.prompt(
      "🔑 Gemini API Key Required\n\n" +
      "Since this app is hosted on a static environment (like GitHub Pages) or the server proxy is unavailable, a Gemini API key is needed to use the AI features.\n\n" +
      "Please enter your Gemini API key (usually starts with 'AIzaSy'):"
    );
    if (userKey && userKey.trim()) {
      const trimmedKey = userKey.trim();
      localStorage.setItem("taskflow_gemini_api_key", trimmedKey);
      activeKey = trimmedKey;
    } else {
      throw new Error("Gemini API key is required but not configured. Click the gear icon on the top right to open settings.");
    }
  }

  const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"];
  let lastError: any = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
      
      const requestBody: any = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };

      if (options.systemInstruction || options.jsonSchema) {
        requestBody.generationConfig = {};
        
        if (options.systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: options.systemInstruction }]
          };
        }
        
        if (options.jsonSchema) {
          requestBody.generationConfig.responseMimeType = "application/json";
          requestBody.generationConfig.responseSchema = options.jsonSchema;
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Direct Gemini API request for model ${model} failed:`, errorText);
        lastError = { status: response.status, text: errorText };
        continue;
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text || null;
      }
      
      return null;
    } catch (err: any) {
      console.warn(`Error during call for model ${model}:`, err);
      lastError = err;
    }
  }

  // If all models failed
  if (lastError) {
    const isQuotaError = lastError.status === 429 || (lastError.text && lastError.text.toLowerCase().includes("quota"));
    
    if (isQuotaError) {
      const changeKey = window.confirm(
        "⚠️ Gemini API Quota Exceeded (Error 429)\n\n" +
        "Your Gemini API key has hit Google's rate limits or free-tier quota limits.\n\n" +
        "Would you like to provide a different/new Gemini API key now to complete this request?"
      );
      if (changeKey) {
        const newKey = window.prompt("🔑 Enter your new Gemini API key:");
        if (newKey && newKey.trim()) {
          localStorage.setItem("taskflow_gemini_api_key", newKey.trim());
          // Retry the function with the new key!
          return callGeminiProxy(prompt, options);
        }
      }
      throw new Error(
        "Quota Exceeded (429). Please wait a few minutes before trying again, or click the gear icon (⚙️) on the top right to enter a fresh Gemini API key."
      );
    } else {
      throw new Error(`Gemini AI service error: ${lastError.text || lastError.message || lastError}`);
    }
  }
  return null;
}
