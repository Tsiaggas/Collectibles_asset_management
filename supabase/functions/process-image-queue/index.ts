import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Νέο, πιο έξυπνο prompt για την OpenAI
const OAI_PROMPT = `
From the provided image(s), extract trading card information.
Respond in clean JSON format with the following keys: title (player's name), set (card set), condition, team, notes.
- If the image contains multiple distinct cards (a lot), add a key "kind": "Lot".
- If the image(s) show a single card (front and back), add "kind": "Single".
- If you only see one side of a single card, assume "kind": "Single".
`;

// Helper για να καλέσουμε την OpenAI
async function callOpenAI(imageUrls: string[]) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const content = [
    { type: "text", text: OAI_PROMPT },
    ...imageUrls.map(url => ({ type: "image_url", image_url: { url } }))
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
    const error = await res.text();
    throw new Error(`OpenAI API failed: ${error}`);
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

    // 1. Παίρνουμε όλα τα "pending" αρχεία από την ουρά
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from("image_processing_queue")
      .select("*")
      .eq("status", "pending")
      .limit(10); // Βάζουμε ένα όριο για να μην πέσει η function

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

      // Παίρνουμε τα public URLs για όλες τις εικόνες της ομάδας
      const imageUrls: { url: string, type: 'front' | 'back' | 'lot' }[] = items.map(item => {
        const url = `${Deno.env.get("PROJECT_URL")}/storage/v1/object/public/${item.bucket_id}/${item.object_name}`;
        let type: 'front' | 'back' | 'lot' = 'lot';
        if (/front/i.test(item.object_name)) type = 'front';
        if (/back/i.test(item.object_name)) type = 'back';
        return { url, type };
      });
      
      try {
        const aiResult = await callOpenAI(imageUrls.map(u => u.url));

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
          image_url_front: imageUrls.find(u => u.type === 'front')?.url || imageUrls[0]?.url,
          image_url_back: imageUrls.find(u => u.type === 'back')?.url
        };
        
        // Χρησιμοποιούμε την upsert_card function που είχαμε φτιάξει!
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_card', { payload: upsertData });
        if (upsertError) throw upsertError;

        // Σημειώνουμε τα items ως "done"
        const idsToUpdate = items.map(i => i.id);
        await supabaseAdmin.from("image_processing_queue").update({ status: 'done' }).in('id', idsToUpdate);

        // <<<< ΝΕΑ ΠΡΟΣΘΗΚΗ: Παύση 2 δευτερολέπτων για να αποφύγουμε το rate limit
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