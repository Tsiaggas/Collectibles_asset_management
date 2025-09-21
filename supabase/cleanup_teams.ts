import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Custom .env parser to bypass the problematic library ---
function parseEnv(filePath: URL): Record<string, string> {
  try {
    const text = Deno.readTextFileSync(filePath);
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
        continue;
      }
      const [key, ...valueParts] = trimmedLine.split("=");
      const value = valueParts.join("=").trim();
      // Remove quotes if they exist at the start and end
      if (value.startsWith('"') && value.endsWith('"')) {
        env[key.trim()] = value.slice(1, -1);
      } else {
        env[key.trim()] = value;
      }
    }
    return env;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(`Error: .env file not found at path: ${filePath.pathname}`);
      return {};
    }
    throw e;
  }
}
// --- End of custom parser ---

// Load environment variables from .env file in the root
const env = parseEnv(new URL('../.env', import.meta.url));

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Please create a .env file in the root directory based on .env.example");
  Deno.exit(1);
}

// IMPORTANT: This map must be kept in sync with the one in the Edge Function
const teamNameMap: { [key: string]: string } = {
    // Germany: Bundesliga
  'fc bayern münchen': 'FC Bayern Munich', 'bayern munich': 'FC Bayern Munich', 'bayern münchen': 'FC Bayern Munich', 'bayern': 'FC Bayern Munich', 'fcb': 'FC Bayern Munich', 'μπάγερν μοναχου': 'FC Bayern Munich',
  'bayer 04 leverkusen': 'Bayer 04 Leverkusen', 'bayer leverkusen': 'Bayer 04 Leverkusen', 'leverkusen': 'Bayer 04 Leverkusen', 'werkself': 'Bayer 04 Leverkusen', 'μπάγερ λεβερκούζεν': 'Bayer 04 Leverkusen',
  'vfb stuttgart': 'VfB Stuttgart', 'stuttgart': 'VfB Stuttgart', 'die schwaben': 'VfB Stuttgart', 'στουτγκάρδη': 'VfB Stuttgart',
  'rb leipzig': 'RB Leipzig', 'leipzig': 'RB Leipzig', 'die roten bullen': 'RB Leipzig', 'λάιπτσιχ': 'RB Leipzig',
  'borussia dortmund': 'Borussia Dortmund', 'dortmund': 'Borussia Dortmund', 'bvb': 'Borussia Dortmund', 'bvb 09': 'Borussia Dortmund', 'ντόρτμουντ': 'Borussia Dortmund',
  'eintracht frankfurt': 'Eintracht Frankfurt', 'frankfurt': 'Eintracht Frankfurt', 'sge': 'Eintracht Frankfurt', 'die adler': 'Eintracht Frankfurt', 'άιντραχτ φρανκφούρτης': 'Eintracht Frankfurt',
  'tsg 1899 hoffenheim': 'TSG Hoffenheim', 'tsg hoffenheim': 'TSG Hoffenheim', 'hoffenheim': 'TSG Hoffenheim', 'χόφενχαϊμ': 'TSG Hoffenheim',
  '1. fc heidenheim': '1. FC Heidenheim', 'heidenheim': '1. FC Heidenheim', 'fch': '1. FC Heidenheim', 'χάιντενχαϊμ': '1. FC Heidenheim',
  'sv werder bremen': 'SV Werder Bremen', 'werder bremen': 'SV Werder Bremen', 'bremen': 'SV Werder Bremen', 'svw': 'SV Werder Bremen', 'βέρντερ βρέμης': 'SV Werder Bremen',
  'sc freiburg': 'SC Freiburg', 'freiburg': 'SC Freiburg', 'scf': 'SC Freiburg', 'φράιμπουργκ': 'SC Freiburg',
  'fc augsburg': 'FC Augsburg', 'augsburg': 'FC Augsburg', 'fca': 'FC Augsburg', 'άουγκσμπουργκ': 'FC Augsburg',
  'vfl wolfsburg': 'VfL Wolfsburg', 'wolfsburg': 'VfL Wolfsburg', 'die wölfe': 'VfL Wolfsburg', 'βόλφσμπουργκ': 'VfL Wolfsburg',
  'fsv mainz 05': 'FSV Mainz 05', 'mainz 05': 'FSV Mainz 05', 'mainz': 'FSV Mainz 05', 'μάιντς': 'FSV Mainz 05',
  'borussia mönchengladbach': 'Borussia Mönchengladbach', 'mönchengladbach': 'Borussia Mönchengladbach', 'gladbach': 'Borussia Mönchengladbach', 'bmg': 'Borussia Mönchengladbach', 'γκλάντμπαχ': 'Borussia Mönchengladbach',
  '1. fc union berlin': '1. FC Union Berlin', 'union berlin': '1. FC Union Berlin', 'die eisernen': '1. FC Union Berlin', 'ούνιον βερολίνου': '1. FC Union Berlin',
  'vfl bochum': 'VfL Bochum', 'bochum': 'VfL Bochum', 'μπόχουμ': 'VfL Bochum', 'vfl bochum 1848': 'VfL Bochum',
  'fc st. pauli': 'FC St. Pauli', 'st. pauli': 'FC St. Pauli', 'kiezkicker': 'FC St. Pauli', 'σανκτ πάουλι': 'FC St. Pauli',
  'holstein kiel': 'Holstein Kiel', 'kiel': 'Holstein Kiel', 'die störche': 'Holstein Kiel', 'χόλσταϊν κίελου': 'Holstein Kiel',
  'fc schalke 04': 'FC Schalke 04', 'schalke 04': 'FC Schalke 04', 'schalke': 'FC Schalke 04', 's04': 'FC Schalke 04', 'σάλκε': 'FC Schalke 04',
  'hertha bsc': 'Hertha Berlin', 'hertha berlin': 'Hertha Berlin', 'hertha': 'Hertha Berlin', 'χέρτα βερολίνου': 'Hertha Berlin',
  '1. fc köln': '1. FC Köln', 'fc köln': '1. FC Köln', 'köln': '1. FC Köln', 'cologne': '1. FC Köln', 'κελν': '1. FC Köln',
  // Austria
  'rb salzburg': 'RB Salzburg', 'red bull salzburg': 'RB Salzburg', 'salzburg': 'RB Salzburg', 'fc salzburg': 'RB Salzburg', 'σάλτσμπουργκ': 'RB Salzburg',
  // Special Cases
  'multiple teams': 'Multiple Teams', 'various teams': 'Multiple Teams', 'various': 'Multiple Teams',
  // ... add all other teams from the main function here for consistency
};

function normalizeTeamName(name: string | null | undefined): string | undefined {
    if (!name) return undefined;
    const lowerCaseName = name.trim().toLowerCase();
    return teamNameMap[lowerCaseName] || name.trim();
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function cleanupTeamNames() {
    console.log("Fetching cards with team names...");
    const { data: cards, error } = await supabaseAdmin
        .from("cards")
        .select("id, team")
        .not("team", "is", null);

    if (error) {
        console.error("Error fetching cards:", error.message);
        return;
    }

    if (!cards || cards.length === 0) {
        console.log("No cards with team names found to cleanup.");
        return;
    }

    console.log(`Found ${cards.length} cards to check.`);

    const updatesToPerform = [];
    let updatedCount = 0;

    for (const card of cards) {
        const originalName = card.team;
        if (!originalName) continue;
        
        const normalizedName = normalizeTeamName(originalName);

        if (normalizedName && normalizedName !== originalName) {
            updatesToPerform.push(
                supabaseAdmin
                    .from("cards")
                    .update({ team: normalizedName })
                    .eq("id", card.id)
            );
            console.log(`- Scheduling update for card ${card.id}: "${originalName}" -> "${normalizedName}"`);
            updatedCount++;
        }
    }

    if (updatesToPerform.length === 0) {
        console.log("All team names are already consistent. No updates needed!");
        return;
    }

    console.log(`\nPerforming ${updatedCount} updates...`);

    const results = await Promise.allSettled(updatesToPerform);

    let successCount = 0;
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error(`Failed to perform an update:`, result.reason?.message || 'Unknown error');
        } else {
            successCount++;
        }
    });

    console.log(`\nCleanup complete!`);
    console.log(`- Successfully updated: ${successCount} records.`);
    console.log(`- Failed to update: ${updatedCount - successCount} records.`);
}

cleanupTeamNames().catch(console.error);
