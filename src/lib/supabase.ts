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

export function rowToItem(row: any): CardItem {
  return {
    id: row.id,
    kind: row.kind ?? 'Single',
    team: row.team ?? undefined,
    numbering: row.numbering ?? undefined,
    title: row.title,
    set: row.set ?? undefined,
    condition: row.condition ?? undefined,
    price: row.price ?? undefined,
    platforms: {
      vinted: row.vinted ?? false,
      vendora: row.vendora ?? false,
      ebay: row.ebay ?? false,
    },
    status: row.status ?? 'Available',
    image_url_front: row.image_url_front ?? undefined,
    image_url_back: row.image_url_back ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function itemToInsert(item: Omit<CardItem, 'id' | 'createdAt'>) {
  return {
    title: item.title,
    set: item.set,
    condition: item.condition,
    price: item.price,
    vinted: item.platforms.vinted,
    vendora: item.platforms.vendora,
    ebay: item.platforms.ebay,
    status: item.status,
    notes: item.notes,
    kind: item.kind,
    team: item.team,
    numbering: item.numbering,
    image_url_front: item.image_url_front,
    image_url_back: item.image_url_back,
  };
}

export function itemToUpdate(item: CardItem) {
  return {
    title: item.title,
    set: item.set,
    condition: item.condition,
    price: item.price,
    vinted: item.platforms.vinted,
    vendora: item.platforms.vendora,
    ebay: item.platforms.ebay,
    status: item.status,
    notes: item.notes,
    kind: item.kind,
    team: item.team,
    numbering: item.numbering,
    image_url_front: item.image_url_front,
    image_url_back: item.image_url_back,
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



