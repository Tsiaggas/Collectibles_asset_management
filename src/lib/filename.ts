import type { CardStatus, PlatformFlags } from '../types';

export type ParsedFromFilename = {
  title?: string;
  set?: string;
  condition?: string;
  price?: number;
  status?: CardStatus;
  platforms?: PlatformFlags;
};

const CONDITION_MAP: Record<string, string> = {
  'm': 'M',
  'mint': 'M',
  'nm': 'NM',
  'near-mint': 'NM',
  'near mint': 'NM',
  'n-mint': 'NM',
  'ex': 'EX',
  'excellent': 'EX',
  'vg': 'VG',
  'very good': 'VG',
  'gd': 'GD',
  'good': 'GD',
  'lp': 'LP',
  'lightly played': 'LP',
  'sp': 'SP',
  'slightly played': 'SP',
  'mp': 'MP',
  'moderately played': 'MP',
  'hp': 'HP',
  'heavily played': 'HP',
  'poor': 'Poor',
};

const STATUS_TOKENS: Record<string, CardStatus> = {
  'available': 'Available',
  'listed': 'Listed',
  'inactive': 'Inactive',
  'sold': 'Sold',
};

const PLATFORM_TOKENS = {
  vinted: ['vinted', 'vin'],
  vendora: ['vendora', 'ven'],
  ebay: ['ebay', 'bay', 'eb'],
};

const KNOWN_SETS = [
  'Base', 'Base Set', 'Jungle', 'Fossil', 'Team Rocket', 'Gym Heroes', 'Gym Challenge',
  'Neo Genesis', 'Neo Discovery', 'Neo Revelation', 'Neo Destiny', 'Legendary Collection',
  'Expedition', 'Aquapolis', 'Skyridge',
];

export function parseFromFilename(filename: string): ParsedFromFilename {
  const result: ParsedFromFilename = {};
  const base = filename.replace(/\.[^.]+$/i, '');
  // normalize separators to spaces
  let text = base.replace(/[._\-\|]+/g, ' ');
  // keep bracketed parts as hints for set
  const bracketMatch = text.match(/[\[(]([^\])\)]/);
  if (bracketMatch && bracketMatch[1]) {
    const candidate = cleanWord(bracketMatch[1]);
    if (candidate) result.set = candidate;
    text = text.replace(bracketMatch[0], ' ');
  }

  // tokens
  const tokens = text.split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();

  // detect price (supports 10, 10.5, 10,50 and optional €)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const m = t.match(/^(?:€)?(\d{1,5}(?:[\.,]\d{1,2})?)€?$/i);
    if (m) {
      const num = Number(m[1].replace(',', '.'));
      if (!Number.isNaN(num)) {
        result.price = num;
        consumed.add(i);
        break;
      }
    }
  }

  // detect status
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (t in STATUS_TOKENS) {
      result.status = STATUS_TOKENS[t];
      consumed.add(i);
    }
  }

  // detect platforms
  const platforms: PlatformFlags = { vinted: false, vendora: false, ebay: false };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (PLATFORM_TOKENS.vinted.includes(t)) { platforms.vinted = true; consumed.add(i); }
    if (PLATFORM_TOKENS.vendora.includes(t)) { platforms.vendora = true; consumed.add(i); }
    if (PLATFORM_TOKENS.ebay.includes(t)) { platforms.ebay = true; consumed.add(i); }
  }
  if (platforms.vinted || platforms.vendora || platforms.ebay) result.platforms = platforms;

  // detect condition
  for (let i = 0; i < tokens.length; i++) {
    const norm = tokens[i].toLowerCase();
    if (norm in CONDITION_MAP) {
      result.condition = CONDITION_MAP[norm];
      consumed.add(i);
      break;
    }
    // patterns like NM/Mint or LP-HP
    const simple = norm.replace(/[^a-z]/g, '');
    if (simple in CONDITION_MAP) {
      result.condition = CONDITION_MAP[simple];
      consumed.add(i);
      break;
    }
  }

  // detect set via keywords "set" or known names
  for (let i = 0; i < tokens.length; i++) {
    const word = cleanWord(tokens[i]);
    if (!word) continue;
    if (/^set$/i.test(word) && i > 0) {
      const prev = cleanWord(tokens[i - 1]);
      if (prev) { result.set = titleCase(prev); consumed.add(i); consumed.add(i - 1); break; }
    }
  }
  if (!result.set) {
    const joined = tokens.map(cleanWord).filter(Boolean).join(' ');
    const found = KNOWN_SETS.find(s => new RegExp(`(^|\s)${escapeRegExp(s)}(\s|$)`, 'i').test(joined));
    if (found) result.set = found;
  }

  // title = leftovers
  const titleTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const w = cleanWord(tokens[i]);
    if (!w) continue;
    if (result.set && equalsIgnoreCase(w, result.set)) continue;
    // skip connective words
    if (/(and|the|of|tcg|pokemon|card|trading)/i.test(w)) continue;
    titleTokens.push(w);
  }
  if (titleTokens.length > 0) {
    result.title = titleCase(titleTokens.join(' ').replace(/\s+/g, ' ').trim());
  }

  return result;
}

function cleanWord(w: string): string {
  return w.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

function titleCase(s: string): string {
  return s.split(' ').map(p => p ? p[0].toUpperCase() + p.slice(1) : '').join(' ');
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


