import { NextResponse } from 'next/server';
import { evaluateExtraction } from '@/lib/evaluator';

export async function POST(req: Request) {
  try {
    const { image, groundTruth } = await req.json();

    const base64Data = image.split(',')[1];
    const mimeType = image.split(';')[0].split(':')[1];
    const base64Url = `data:${mimeType};base64,${base64Data}`;

    const prompt = `You are a strict data extraction AI. Extract the following fields from this Indian bill: vendor_name, invoice_number, date (must be YYYY-MM-DD), total_amount (number), tax_amount (number), gstin. Return ONLY a raw JSON object. Do not include markdown formatting, backticks, or the word 'json'. If a field is missing or illegible, return "null" for strings or 0 for numbers. If a vendor name is in a regional language, transliterate it to English.`;

    // Fetch Gemini Models
    const fetchGemini = async (model: string) => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
          generationConfig: { temperature: 0.0, response_mime_type: "application/json" }
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`\n[GEMINI API ERROR - ${model}] Status ${res.status}:`, errorText);
        throw new Error(`Gemini ${model} failed (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    };

    // Fetch Vision via Groq
    const fetchLlamaVision = async () => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}` 
        },
        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: base64Url } }
            ]
          }],
          temperature: 0.0,
          response_format: { type: "json_object" }
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`\n[GROQ API ERROR] Status ${res.status}:`, errorText);
        throw new Error(`Groq Vision failed (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return JSON.parse(data.choices[0].message.content);
    };

    // Execute all 3 models in parallel for this single image
    const [flashData, flashLiteData, llamaData] = await Promise.all([
      fetchGemini('gemini-flash-latest').catch(e => ({ error: e.message })),
      fetchGemini('gemini-flash-lite-latest').catch(e => ({ error: e.message })),
      fetchLlamaVision().catch(e => ({ error: e.message }))
    ]);

    // Run the Hybrid Jaro-Winkler/Metaphone Evaluator
    // Run the Hybrid Jaro-Winkler/Metaphone Evaluator (Only if groundTruth exists)
    const evaluatedData = {
      gemini_flash: {
        extracted: flashData,
        evaluation: (flashData.error || !groundTruth) ? null : evaluateExtraction(flashData, groundTruth)
      },
      gemini_flash_lite: {
        extracted: flashLiteData,
        evaluation: (flashLiteData.error || !groundTruth) ? null : evaluateExtraction(flashLiteData, groundTruth)
      },
      llama_vision: {
        extracted: llamaData,
        evaluation: (llamaData.error || !groundTruth) ? null : evaluateExtraction(llamaData, groundTruth)
      }
    };

    return NextResponse.json(evaluatedData);

  } catch (error: any) {
    console.error("Pipeline Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}