import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// Νέο, πιο έξυπνο prompt για την OpenAI
const OAI_PROMPT = `
From the provided image(s), extract trading card information.
Respond in clean JSON format with the following keys: title (player's name), set (card set), condition, team, notes.
- If the image contains multiple distinct cards (a lot), add a key "kind": "Lot".
- If the image(s) show a single card (front and back), add "kind": "Single".
- If you only see one side of a single card, assume "kind": "Single".
`;

// Helper για να πάρουμε τον τύπο της εικόνας από το όνομα αρχείου
function getMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg'; // Default σε JPEG
  }
}

// <<-- ΑΝΑΒΑΘΜΙΣΜΕΝΗ FUNCTION -->>
// Τώρα δέχεται τα items και τον supabase client για να κατεβάσει τις εικόνες η ίδια
async function callOpenAI(items: any[], supabaseAdmin: SupabaseClient) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  // Μετατροπή κάθε εικόνας σε base64
  const imageContents = await Promise.all(items.map(async (item) => {
    // 1. Κατεβάζουμε το αρχείο
    const { data: blob, error } = await supabaseAdmin.storage
      .from(item.bucket_id)
      .download(item.object_name);

    if (error) {
      throw new Error(`Failed to download ${item.object_name}: ${error.message}`);
    }

    // 2. Το μετατρέπουμε σε base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64String = encode(arrayBuffer);
    const mimeType = getMimeType(item.object_name);

    // 3. Το ετοιμάζουμε για το payload του API
    return {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64String}` },
    };
  }));

  const content = [
    { type: "text", text: OAI_PROMPT },
    ...imageContents, // Στέλνουμε τα δεδομένα της εικόνας, όχι URL
  ];

  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
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
    const errorText = await res.text();
    // Προσπαθούμε να κάνουμε parse το error για καλύτερο logging
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`OpenAI API failed: ${errorJson.error.message}`);
    } catch {
      throw new Error(`OpenAI API failed: ${errorText}`);
    }
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Helper για να εισάγουμε μια παύση
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

serve(async (_req) => {
  try {
    // Χρησιμοποιούμε τα secrets που έχουμε ορίσει εμείς, όχι τα αυτόματα του Supabase, για σαφήνεια.
    // Αυτή η function χρειάζεται πλήρη δικαιώματα για να διαχειρίζεται την "ουρά".
    const supabaseAdmin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // 1. Παίρνουμε τα "pending" αρχεία από την ουρά
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from("image_processing_queue")
      .select("*")
      .eq("status", "pending")
      .limit(3); // <<-- ΤΕΛΙΚΗ ΡΥΘΜΙΣΗ: Μόνο 3 αρχεία τη φορά για να είμαστε κάτω από το όριο της OpenAI

    if (queueError) throw queueError;
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: "No new images to process." }), { status: 200 });
    }

    // 2. Ομαδοποίηση αρχείων
    const groupedFiles = new Map<string, any[]>();
    for (const item of queueItems) {
      // Λογική ομαδοποίησης: 'gittensfront.jpg' -> 'gittens'
      const baseName = item.object_name.split('/').pop()!
        .replace(/front|back|1|2/i, '') // Αφαιρούμε λέξεις-κλειδιά
        .replace(/\.[^/.]+$/, "") // Αφαιρούμε την κατάληξη
        .trim();
      
      if (!groupedFiles.has(baseName)) {
        groupedFiles.set(baseName, []);
      }
      groupedFiles.get(baseName)!.push(item);
    }
    
    // 3. Επεξεργασία κάθε ομάδας
    for (const [baseName, items] of groupedFiles.entries()) {
      console.log(`Processing group: ${baseName}`);
      
      try {
        // <<-- ΑΛΛΑΓΗ: Καλούμε την callOpenAI με τα items και τον supabaseAdmin
        const aiResult = await callOpenAI(items, supabaseAdmin);

        // (Τα public URLs τα χρειαζόμαστε ακόμα για να τα αποθηκεύσουμε στη βάση)
        const imageUrls: { url: string, type: 'front' | 'back' | 'lot' }[] = items.map(item => {
          const url = `${Deno.env.get("PROJECT_URL")}/storage/v1/object/public/${item.bucket_id}/${item.object_name}`;
          let type: 'front' | 'back' | 'lot' = 'lot';
          if (/front/i.test(item.object_name)) type = 'front';
          if (/back/i.test(item.object_name)) type = 'back';
          return { url, type };
        });

        // Βρίσκουμε το πραγματικό όνομα αρχείου για το lot, αν υπάρχει
        const lotItemName = items.find(item => /lot/i.test(item.object_name))?.object_name;
        
        const upsertData = {
          title: aiResult.title || (lotItemName ? lotItemName.split('/').pop()!.replace(/\.[^/.]+$/, "") : baseName),
          set: aiResult.set,
          condition: aiResult.condition,
          team: aiResult.team,
          notes: aiResult.notes,
          kind: aiResult.kind || (/lot/i.test(baseName) ? 'Lot' : 'Single'),
          status: 'New',
          image_url_front: imageUrls.find(u => u.type === 'front')?.url || imageUrls.find(u => u.type === 'lot')?.url || imageUrls[0]?.url,
          image_url_back: imageUrls.find(u => u.type === 'back')?.url
        };
        
        // Χρησιμοποιούμε την upsert_card function που είχαμε φτιάξει!
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_card', { payload: upsertData });
        if (upsertError) throw upsertError;

        // Σημειώνουμε τα items ως "done"
        const idsToUpdate = items.map(i => i.id);
        await supabaseAdmin.from("image_processing_queue").update({ status: 'done' }).in('id', idsToUpdate);

        // Παύση για να αποφύγουμε το rate limit
        await delay(2000);

      } catch (e) {
        console.error(`Failed to process group ${baseName}:`, e.message);
        const idsToUpdate = items.map(i => i.id);

        // Αν το σφάλμα είναι rate limit, μην το αλλάξεις σε 'error', άφησέ το 'pending' για την επόμενη φορά.
        if (e.message.includes("rate_limit_exceeded")) {
          console.log(`Rate limit hit for ${baseName}. Leaving as pending.`);
        } else {
          await supabaseAdmin.from("image_processing_queue").update({ status: 'error' }).in('id', idsToUpdate);
        }
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${groupedFiles.size} groups.` }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});