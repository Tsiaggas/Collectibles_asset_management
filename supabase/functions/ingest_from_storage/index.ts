// Supabase Edge Function: Triggered from Storage webhook to ingest card images
// Event payload (Storage): https://supabase.com/docs/guides/functions/storage-webhooks

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// 1. Schema for OpenAI response validation (Best Practice)
const OAIResponseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  set: z.string().optional().nullable(),
  condition: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).partial().passthrough(); // Allow other fields but validate these

type OAIResponse = z.infer<typeof OAIResponseSchema>;

// Helper for consistent JSON responses
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function extractViaOpenAI(imageUrl: string): Promise<OAIResponse | null> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    return null;
  }

  const prompt = `Extract trading card fields from this image. Return clean JSON with keys: title, set, condition, notes.`;
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("OpenAI API request failed:", res.status, errorText);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("OpenAI response content is empty.");
      return null;
    }

    // 2. Safe parsing and validation (Best Practice)
    const parsedContent = JSON.parse(content);
    const validation = OAIResponseSchema.safeParse(parsedContent);
    if (!validation.success) {
      console.error("OpenAI response validation failed:", validation.error.flatten());
      // Return the raw data anyway if title exists, or null
      return parsedContent.title ? parsedContent : null;
    }
    return validation.data;
  } catch (error) {
    console.error("Error during OpenAI extraction:", error);
    return null;
  }
}

serve(async (req) => {
  // This is to handle CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const payload = await req.json();
    const record = payload?.record;
    if (!record?.bucket || !record?.name) {
      return jsonResponse({ error: "Invalid payload, missing bucket or name" }, 400);
    }
    console.log(`Processing ${record.bucket}/${record.name}`);

    const BUCKET_IS_PRIVATE = false; // <-- SET THIS TO true IF YOUR BUCKET IS PRIVATE
    const SIGNED_URL_EXPIRATION = 60 * 5; // 5 minutes

    // 3. Create Supabase client from within the function
    // We use the anon key from the Authorization header, which is passed by the trigger.
    // This maintains security context.
    const anonKey = req.headers.get('Authorization')?.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('PROJECT_URL');

    if (!supabaseUrl || !anonKey) {
        return jsonResponse({ error: 'Missing PROJECT_URL or Authorization header' }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey);
    const storage = supabase.storage.from(record.bucket);
    
    let imageUrl: string;

    // 4. Logic for public vs signed URL (Deliverable)
    if (BUCKET_IS_PRIVATE) {
      console.log("Bucket is private, generating signed URL.");
      const { data, error } = await storage.createSignedUrl(record.name, SIGNED_URL_EXPIRATION);
      if (error) {
        console.error("Failed to create signed URL:", error);
        return jsonResponse({ error: "Failed to create signed URL", details: error.message }, 500);
      }
      imageUrl = data.signedUrl;
    } else {
      console.log("Bucket is public, generating public URL.");
      const { data } = storage.getPublicUrl(record.name);
      imageUrl = data.publicUrl;
    }

    let extracted = await extractViaOpenAI(imageUrl);
    if (!extracted || !extracted.title) {
      const defaultTitle = record.name.split('/').pop()?.replace(/\.[^/.]+$/, "") ?? 'Unknown Title';
      console.warn(`AI extraction failed or title missing. Using default title: ${defaultTitle}`);
      extracted = { ...extracted, title: defaultTitle };
    }
    
    // 5. Safer upsert via RPC (Best Practice / Deliverable)
    console.log(`Upserting card with title: "${extracted.title}"`);
    const rpcPayload = {
      title: extracted.title,
      set: extracted.set ?? null,
      condition: extracted.condition ?? null,
      status: 'New',
      image_url: imageUrl.split('?')[0], // Store the clean URL without tokens
      notes: extracted.notes ?? null,
    };

    const { data, error } = await supabase.rpc('upsert_card', { payload: rpcPayload });

    if (error) {
      console.error('DB RPC upsert failed:', error);
      return jsonResponse({ error: 'DB upsert failed', details: error.message }, 500);
    }

    if (!data || data.length === 0) {
        console.log('Duplicate title, skipped insertion.');
        return jsonResponse({ ok: true, message: 'Duplicate, skipped.' });
    }

    console.log('Successfully inserted/updated card:', data);
    return jsonResponse({ ok: true, inserted: data });

  } catch (e) {
    console.error("An unexpected error occurred:", e);
    return jsonResponse({ error: 'Bad request or unexpected error', details: e.message }, 400);
  }
});


