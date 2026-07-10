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
  if (!localKey) {
    throw new Error("Gemini API key is required but not configured. Set it in the AI Settings.");
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${localKey}`;
    
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
      console.error("Direct Gemini API request failed:", errorText);
      throw new Error(`Google API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text || null;
    }
    
    return null;
  } catch (directError: any) {
    console.error("Error during direct client-side Gemini execution:", directError);
    throw directError;
  }
}
