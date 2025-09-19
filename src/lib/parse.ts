import type { CardItem, CardStatus, PlatformFlags } from '../types';

export type ParsedRow = {
  kind?: 'Single' | 'Lot';
  team?: string;
  title: string;
  set?: string;
  condition?: string;
  price?: number;
  platforms: PlatformFlags;
  status?: CardStatus;
  imageUrl?: string;
  notes?: string;
};

export type Delimiter = ',' | '\t' | '|';

const HEADER = [
  'kind',
  'team',
  'title',
  'set',
  'condition',
  'price',
  'vinted',
  'vendora',
  'ebay',
  'status',
  'imageUrl',
  'notes',
] as const;

const truthy = (val: string | undefined): boolean => {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
};

function detectDelimiter(firstLine: string): Delimiter {
  if (firstLine.includes('|')) return '|';
  if (firstLine.includes('\t')) return '\t';
  return ',';
}

function splitLine(line: string, delimiter: Delimiter): string[] {
  if (delimiter === ',') {
    // naive CSV split (no quoted fields handling for MVP)
    return line.split(',');
  }
  if (delimiter === '\t') return line.split('\t');
  return line.split('|');
}

export function parseBulk(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Normalize literal "\t" sequences to actual tab when users paste from examples
  const nLines = lines.map((l) => l.replace(/\\t/g, '\t'));

  const delimiter = detectDelimiter(nLines[0]);
  const firstCols = splitLine(nLines[0], delimiter).map((c) => c.trim());
  const hasHeader = HEADER.every((h, i) => (firstCols[i] || '').toLowerCase() === h || (h === 'kind' && (firstCols[i] || '').toLowerCase() !== 'title'));

  const dataLines = hasHeader ? nLines.slice(1) : nLines;

  const rows: ParsedRow[] = dataLines.map((line) => {
    const cols = splitLine(line, delimiter);
    const [
      kind,
      team,
      title,
      set,
      condition,
      price,
      vinted,
      vendora,
      ebay,
      status,
      imageUrl,
      notes,
    ] = cols.map((c) => c?.trim() ?? '');

    const numPrice = price ? Number(price) : undefined;
    const parsed: ParsedRow = {
      kind: (kind?.toLowerCase() === 'lot' ? 'Lot' : kind?.toLowerCase() === 'single' ? 'Single' : undefined),
      team: team || undefined,
      title,
      set: set || undefined,
      condition: condition || undefined,
      price: Number.isFinite(numPrice!) ? numPrice : undefined,
      platforms: {
        vinted: truthy(vinted),
        vendora: truthy(vendora),
        ebay: truthy(ebay),
      },
      status: (status as CardStatus) || undefined,
      imageUrl: imageUrl || undefined,
      notes: notes || undefined,
    };
    return parsed;
  });

  return rows.filter((r) => r.title && r.title.length > 0);
}

export function toCardItems(rows: ParsedRow[]): CardItem[] {
  const now = new Date();
  return rows.map((r) => ({
    id: crypto.randomUUID(),
    kind: r.kind,
    team: r.team,
    title: r.title,
    set: r.set,
    condition: r.condition,
    price: r.price,
    platforms: r.platforms,
    status: (r.status ?? 'Available') as CardStatus,
    imageUrl: r.imageUrl,
    notes: r.notes,
    createdAt: now.toISOString(),
  }));
}


