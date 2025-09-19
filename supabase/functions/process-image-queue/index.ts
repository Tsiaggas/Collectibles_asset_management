import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// <<-- ΑΝΑΒΑΘΜΙΣΜΕΝΟ PROMPT v4 -->>
const OAI_PROMPT = `
You are an expert trading card identifier, preparing structured data for an asset management tool.
From the provided images, extract the card's details precisely.
Your response MUST be in JSON format. Prioritize the 'front' image for primary details.

**JSON Schema & Instructions:**

- **title**: (string) A detailed, structured title. CONSTRUCT IT using this template:
  '[Autograph?] [Player Name] [Year] [Set] [Team] [/Numbering?]'.
  - ONLY include 'Autograph' if you see a signature on the card.
  - Player Name, Year, Set, and Team should be identified from the card.
  - ONLY include the numbering (e.g., '/99') if it's visible.
  - Example: "Autograph Serge Gnabry 2023-2024 Topps Museum Collection Bayern Munich /99"
  - Example (no autograph/numbering): "Jamal Musiala 2023 Topps Chrome FC Bayern Munich"

- **set**: (string) The specific set of the card (e.g., "Topps Museum Collection").
- **condition**: (string) The card's condition (e.g., "Near Mint"). Leave null if unclear.
- **team**: (string) The player's team. IMPORTANT: Be consistent. For Bayern, always return "FC Bayern Munich".
- **kind**: (string) "Single" or "Lot".
- **numbering**: (string) The card's serial number suffix (e.g., "/25", "/49", "/99"). If the card is NOT numbered, use the string "base".
- **notes**: (string) A **concise description in ENGLISH**. 
  - For **Single cards**, mention key features like player, team, set, and any special characteristics (e.g., "Autographed card", "Numbered to 99", "Refractor parallel").
  - For **Lots**, summarize the content (e.g., "Lot of 3 cards from VfL Wolfsburg, including a numbered Maxence Lacroix autograph.").

**Examples:**
- **Single Card Notes:** "Serge Gnabry autograph card from 2023-2024 Topps Museum Collection. Numbered /99. A great collectible for any Bayern Munich fan."
- **Lot Notes:** "Lot of 3 VfL Wolfsburg cards from Topps Chrome. Features a numbered Konstantinos Koulierakis /25 and a Maxence Lacroix autograph. Excellent for team collectors."
`;

// Helper για "καθαρισμό" ονομάτων ομάδων
const teamNameMap: { [key: string]: string } = {
  'fc bayern münchen': 'FC Bayern Munich',
  'bayern munich': 'FC Bayern Munich',
  'bayern münchen': 'FC Bayern Munich',
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
    // Χρησιμοποιούμε τα secrets που έχουμε ορίσει εμείς, όχι τα αυτόματα του Supabase, για σαφήνεια.
    // Αυτή η function χρειάζεται πλήρη δικαιώματα για να διαχειρίζεται την "ουρά".
    const supabaseAdmin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // <<-- ΝΕΑ ΛΟΓΙΚΗ: STAGING AREA -->>
    // 1. Παίρνουμε ΟΛΑ τα "pending" αρχεία που έχει "προάγει" ο νέος Cron Job.
    // Η λογική της αναμονής έχει μεταφερθεί ΕΚΤΟΣ της function, κάνοντάς την πιο αξιόπιστη.
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from("image_processing_queue")
      .select("*")
      .eq("status", "pending") // <-- Παίρνουμε μόνο όσα είναι έτοιμα για επεξεργασία
      .limit(50); // Μπορούμε να έχουμε ένα μεγαλύτερο όριο τώρα

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
        
        const normalizedTeam = normalizeTeamName(aiResult.team);

        // <<-- ΔΙΟΡΘΩΣΗ BUG ΣΤΗΝ ΑΝΑΘΕΣΗ ΕΙΚΟΝΩΝ -->>
        const frontUrl = imageUrls.find(u => u.type === 'front')?.url;
        const backUrl = imageUrls.find(u => u.type === 'back')?.url;
        const lotUrl = imageUrls.find(u => u.type === 'lot')?.url;
        
        // Βρίσκει μια κύρια εικόνα. Προτεραιότητα: front, μετά lot.
        // Αν δεν υπάρχουν, παίρνει την πρώτη εικόνα του group ΠΟΥ ΔΕΝ ΕΙΝΑΙ 'back'.
        // Ως έσχατη λύση (αν υπάρχει μόνο 'back' εικόνα), παίρνει την πρώτη που θα βρει.
        const primaryImageUrl = frontUrl || lotUrl || imageUrls.find(u => u.type !== 'back')?.url || imageUrls[0]?.url;

        const upsertData = {
          title: aiResult.title || (lotItemName ? lotItemName.split('/').pop()!.replace(/\.[^/.]+$/, "") : baseName),
          set: aiResult.set,
          condition: aiResult.condition,
          team: normalizedTeam, // <-- Αποθηκεύουμε την "καθαρή" εκδοχή
          notes: aiResult.notes,
          kind: aiResult.kind || (/lot/i.test(baseName) ? 'Lot' : 'Single'),
          status: 'New',
          numbering: aiResult.numbering, // <-- Προσθήκη του νέου πεδίου
          // <<-- ΒΕΛΤΙΩΜΕΝΗ ΑΝΤΙΣΤΟΙΧΙΣΗ ΕΙΚΟΝΩΝ -->>
          image_url_front: primaryImageUrl,
          image_url_back: backUrl,
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

        // Έλεγχος για προσωρινά σφάλματα (rate limits, σφάλματα server)
        // Αν το σφάλμα είναι τέτοιου τύπου, το αφήνουμε ως 'pending' για να ξαναπροσπαθήσει.
        const isTransientError = e.message.includes("rate_limit_exceeded") || 
                                 e.message.includes("502") || 
                                 e.message.includes("Bad gateway") ||
                                 e.message.includes("500") ||
                                 e.message.includes("503") ||
                                 e.message.includes("504");

        if (isTransientError) {
          console.log(`Transient error for ${baseName}. Leaving as pending for retry.`);
        } else {
          // Αυτό είναι ένα πιο μόνιμο σφάλμα (π.χ. λάθος API key, κακό prompt)
          await supabaseAdmin.from("image_processing_queue").update({ status: 'error' }).in('id', idsToUpdate);
        }
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${groupedFiles.size} groups.` }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});