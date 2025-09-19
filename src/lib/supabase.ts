import { createClient } from '@supabase/supabase-js';
import type { CardItem } from '../types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabase
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
  : (null as any);

// Mapping helpers snake_case <-> camelCase
type DbRow = {
  id: string;
  kind: 'Single' | 'Lot' | null;
  team: string | null;
  title: string;
  set: string | null;
  condition: string | null;
  price: number | null;
  vinted: boolean;
  vendora: boolean;
  ebay: boolean;
  status: 'Available' | 'Listed' | 'Inactive' | 'Sold';
  image_url: string | null;
  notes: string | null;
  created_at: string;
};

export function rowToItem(r: DbRow): CardItem {
  return {
    id: r.id,
    kind: (r.kind ?? undefined) as CardItem['kind'],
    team: r.team ?? undefined,
    title: r.title,
    set: r.set ?? undefined,
    condition: r.condition ?? undefined,
    price: r.price ?? undefined,
    platforms: { vinted: r.vinted, vendora: r.vendora, ebay: r.ebay },
    status: r.status,
    imageUrl: r.image_url ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

export function itemToInsert(item: Omit<CardItem, 'id' | 'createdAt'>) {
  return {
    kind: item.kind ?? 'Single',
    team: item.team ?? null,
    title: item.title,
    set: item.set ?? null,
    condition: item.condition ?? null,
    price: item.price ?? null,
    vinted: item.platforms.vinted,
    vendora: item.platforms.vendora,
    ebay: item.platforms.ebay,
    status: item.status,
    image_url: item.imageUrl ?? null,
    notes: item.notes ?? null,
  };
}

export function itemToUpdate(item: CardItem) {
  return {
    kind: item.kind ?? 'Single',
    team: item.team ?? null,
    title: item.title,
    set: item.set ?? null,
    condition: item.condition ?? null,
    price: item.price ?? null,
    vinted: item.platforms.vinted,
    vendora: item.platforms.vendora,
    ebay: item.platforms.ebay,
    status: item.status,
    image_url: item.imageUrl ?? null,
    notes: item.notes ?? null,
  };
}

// Storage helpers (bucket: card-images)
export async function uploadImageToStorage(file: File, path: string): Promise<string> {
  const bucket = 'card-images';
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}



