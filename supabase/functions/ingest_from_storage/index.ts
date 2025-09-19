// Supabase Edge Function: Triggered from Storage webhook to ingest card images
// Event payload (Storage): https://supabase.com/docs/guides/functions/storage-webhooks

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type ExtractResponse = Partial<{
  title: string;
  set: string;
  condition: string;
  status: 'Available' | 'Listed' | 'Inactive' | 'Sold' | 'New';
  notes: string;
}>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function extractViaOpenAI(imageUrl: string, OPENAI_API_KEY?: string): Promise<ExtractResponse> {
  if (!OPENAI_API_KEY) return {};
  const prompt = `Extract trading card fields from this image. Return JSON with keys: title, set, condition, status, notes. Use status among: New, Available, Listed, Inactive, Sold.`;
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ]},
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return {};
  const data = await res.json();
  try {
    const content = data.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : {};
  } catch { return {}; }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ ok: true });
    const payload = await req.json();
    const record = payload?.record ?? payload?.data?.record; // supabase formats
    if (!record) return jsonResponse({ error: 'No record' }, 400);

    const bucket = record.bucket?.name ?? record.bucket;
    const path = record.name ?? record.path;
    if (!bucket || !path) return jsonResponse({ error: 'Invalid record' }, 400);

    // Secrets names must NOT start with SUPABASE_ in dashboard, so we use custom names
    const urlBase = Deno.env.get('PROJECT_URL');
    const serviceRole = Deno.env.get('SERVICE_ROLE_KEY');
    if (!urlBase || !serviceRole) return jsonResponse({ error: 'Missing PROJECT_URL or SERVICE_ROLE_KEY' }, 500);

    // Δημιουργία public URL χωρίς να κωδικοποιούνται τα '/'
    const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
    const publicUrl = `${urlBase}/storage/v1/object/public/${bucket}/${encodedPath}`;

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const extracted = await extractViaOpenAI(publicUrl, OPENAI_API_KEY);

    const body = {
      kind: 'Single',
      team: null,
      title: extracted.title ?? path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Unknown',
      set: extracted.set ?? null,
      condition: extracted.condition ?? null,
      price: null,
      vinted: false,
      vendora: false,
      ebay: false,
      status: 'New',
      image_url: publicUrl,
      notes: extracted.notes ?? null,
    };

    // Upsert in DB
    const res = await fetch(`${urlBase}/rest/v1/cards?on_conflict=title_norm&select=*`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRole,
        'Authorization': `Bearer ${serviceRole}`,
        'Prefer': 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('DB upsert failed', txt);
      return jsonResponse({ error: 'DB upsert failed', details: txt }, 500);
    }
    const data = await res.json();
    return jsonResponse({ inserted: data });
  } catch (e) {
    return jsonResponse({ error: 'bad request', details: String(e) }, 400);
  }
});


