// Deno Deploy (Supabase Edge Function)
// POST JSON: { image_base64: string }
// Returns: { title?, set?, condition?, status?, notes? }
// If OPENAI_API_KEY is set (secret), calls OpenAI vision to extract fields.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type ExtractResponse = {
  title?: string;
  set?: string;
  condition?: string;
  status?: 'Available' | 'Listed' | 'Inactive' | 'Sold';
  notes?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { image_base64 } = await req.json();
    if (!image_base64) return jsonResponse({ error: 'Missing image_base64' }, 400);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      // Fallback: no AI, return empty
      return jsonResponse({});
    }

    const prompt = `Extract structured fields about a trading card from this image. 
Return strict JSON with keys: title, set, condition, status, notes. status must be one of: Available, Listed, Inactive, Sold. If unknown, omit field.`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
          ],
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      return jsonResponse({ error: 'OpenAI error', details: txt }, 500);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed: ExtractResponse = {};
    if (content) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }
    }
    return jsonResponse(parsed);
  } catch (e) {
    return jsonResponse({ error: 'Bad request', details: String(e) }, 400);
  }
});


