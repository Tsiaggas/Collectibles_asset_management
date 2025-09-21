import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// <<-- ΑΝΑΒΑΘΜΙΣΜΕΝΟ PROMPT v5 -->>
const OAI_PROMPT = `
You are an expert trading card identifier, preparing structured data for an asset management tool.
From the provided images, extract the card's details precisely.
Your response MUST be in JSON format. Prioritize the 'front' image for primary details if available.

**CRITICAL FIRST STEP: Determine if this is a 'Single' card or a 'Lot'.**
- If only ONE card is clearly depicted, proceed as a 'Single'.
- If MULTIPLE distinct cards are visible, you MUST treat it as a 'Lot'.

**JSON Schema & Instructions:**

--- IF 'Single' ---
- **title**: (string) CONSTRUCT IT using this template: '[Autograph?] [Player Name] [Year] [Set] [Team] [/Numbering?]'.
  - Example: "Autograph Serge Gnabry 2023-2024 Topps Museum Collection FC Bayern Munich /99"
- **notes**: (string) A concise description in ENGLISH. Mention key features like player, team, set, and any special characteristics.
  - Example: "Serge Gnabry autograph card from 2023-2024 Topps Museum Collection. Numbered /99. A great collectible for any Bayern Munich fan."

--- IF 'Lot' ---
- **title**: (string) CONSTRUCT IT using this template: 'Lot of [Number of Cards] [Set] cards - [Team]'.
  - Example: "Lot of 5 Topps Chrome cards - FSV Mainz 05"
- **notes**: (string) A concise description in ENGLISH. SUMMARIZE the content. List the most prominent players you can identify.
  - Example: "Lot of 5 cards from the Topps Chrome set, featuring players from FSV Mainz 05. Includes Anton Stach, Moussa Niakhaté, Jeremiah St. Juste, and Jonathan Burkardt."

--- COMMON FIELDS (for both Single & Lot) ---
- **set**: (string) The specific set of the card(s) (e.g., "Topps Chrome", "Topps Museum Collection").
- **condition**: (string) The card's condition (e.g., "Near Mint"). Leave null if unclear.
- **team**: (string) The primary team featured. IMPORTANT: Be consistent. For Bayern, always return "FC Bayern Munich". For Mainz, use "FSV Mainz 05".
- **kind**: (string) MUST be "Single" or "Lot". This is mandatory.
- **numbering**: (string) For 'Single' cards, the serial number suffix (e.g., "/25", "/99"). If not numbered, use "base". For 'Lot', this field should be null.
`;

// Helper για "καθαρισμό" ονομάτων ομάδων
const teamNameMap: { [key: string]: string } = {
  'fc bayern münchen': 'FC Bayern Munich',
  'bayern munich': 'FC Bayern Munich',
  'bayern münchen': 'FC Bayern Munich',
  'fsv mainz 05': 'FSV Mainz 05',
  'mainz 05': 'FSV Mainz 05',
  // Πρόσθεσε εδώ κι άλλες παραλλαγές στο μέλλον
};

function normalizeTeamName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const lowerCaseName = name.trim().toLowerCase();
  return teamNameMap[lowerCaseName] || name.trim();
}

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
    const supabaseAdmin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // <<-- ΝΕΑ, ΑΠΛΟΥΣΤΕΥΜΕΝΗ ΛΟΓΙΚΗ -->>
    // 1. Παίρνουμε ΟΛΑ τα νέα αρχεία που μόλις μπήκαν.
    // Η επεξεργασία είναι άμεση, δεν περιμένουμε πια.
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from("image_processing_queue")
      .select("*")
      .eq("status", "new") // <-- Παίρνουμε απευθείας τα 'new'
      .limit(50); 

    if (queueError) throw queueError;
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: "No new images to process." }), { status: 200 });
    }

    // 2. Ομαδοποίηση βάσει του νέου path (UUID)
    const groupedFiles = new Map<string, any[]>();
    for (const item of queueItems) {
      // Το path είναι πλέον: public/<group-uuid>/<role>.ext
      // Άρα το group-uuid είναι το δεύτερο στοιχείο
      const pathParts = item.object_name.split('/');
      if (pathParts.length < 2) continue; // Αγνοούμε αρχεία που δεν είναι σε φάκελο

      const groupId = pathParts[1]; // Αυτό είναι το UUID του group
      
      if (!groupedFiles.has(groupId)) {
        groupedFiles.set(groupId, []);
      }
      groupedFiles.get(groupId)!.push(item);
    }
    
    // 3. Επεξεργασία κάθε ομάδας
    for (const [groupId, items] of groupedFiles.entries()) {
      console.log(`Processing group: ${groupId}`);
      
      try {
        const aiResult = await callOpenAI(items, supabaseAdmin);

        const imageUrls: { url: string, type: 'front' | 'back' | 'other' }[] = items.map(item => {
          const url = `${Deno.env.get("PROJECT_URL")}/storage/v1/object/public/${item.bucket_id}/${item.object_name}`;
          const filename = item.object_name.split('/').pop()!;
          let type: 'front' | 'back' | 'other' = 'other';
          if (/^front/i.test(filename)) type = 'front';
          if (/^back/i.test(filename)) type = 'back';
          return { url, type };
        });
        
        const normalizedTeam = normalizeTeamName(aiResult.team);

        const frontUrl = imageUrls.find(u => u.type === 'front')?.url;
        const backUrl = imageUrls.find(u => u.type === 'back')?.url;
        
        // Ως κύρια εικόνα, παίρνουμε το front URL ή το πρώτο διαθέσιμο.
        const primaryImageUrl = frontUrl || imageUrls[0]?.url;

        const upsertData = {
          title: aiResult.title || groupId, // Fallback στο UUID αν το AI αποτύχει
          set: aiResult.set,
          condition: aiResult.condition,
          team: normalizedTeam,
          notes: aiResult.notes,
          kind: aiResult.kind || (items.length > 2 ? 'Lot' : 'Single'), // Improved fallback
          status: 'New',
          numbering: aiResult.numbering,
          image_url_front: primaryImageUrl,
          image_url_back: backUrl,
        };
        
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_card', { payload: upsertData });
        if (upsertError) throw upsertError;

        // Σημειώνουμε τα items ως "done"
        const idsToUpdate = items.map(i => i.id);
        await supabaseAdmin.from("image_processing_queue").update({ status: 'done' }).in('id', idsToUpdate);

        // Παύση για να αποφύγουμε το rate limit
        await delay(2000);

      } catch (e: any) {
        console.error(`Failed to process group ${groupId}:`, e.message);
        const idsToUpdate = items.map(i => i.id);

        const isTransientError = e.message.includes("rate_limit_exceeded") || 
                                 e.message.includes("502") || 
                                 e.message.includes("Bad gateway") ||
                                 e.message.includes("500") ||
                                 e.message.includes("503") ||
                                 e.message.includes("504");

        // Τώρα, ΟΛΑ τα λάθη είναι μόνιμα γιατί δεν υπάρχει retry mechanism με cron.
        // Αν αποτύχει, πρέπει να το δει ο χρήστης.
        if (isTransientError) {
          console.warn(`Transient error for ${groupId}. Marking as 'error' for manual review.`);
        }
        
        await supabaseAdmin.from("image_processing_queue").update({ status: 'error' }).in('id', idsToUpdate);
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${groupedFiles.size} groups.` }), { status: 200 });

  } catch (e: any) {
    console.error("An unexpected error occurred in the main block:", e);
    return new Response(JSON.stringify({ error: 'Bad request or unexpected error', details: e.message }), { status: 400 });
  }
});