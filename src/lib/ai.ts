import type { CardItem } from '../types';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

type ExtractResponse = Partial<Pick<CardItem, 'title'|'set'|'condition'|'status'|'notes'>>;
type PriceSuggestResponse = { priceMin?: number; priceAvg?: number; priceMax?: number; currency?: string };

export async function extractFromImageViaEdge(image: Blob): Promise<ExtractResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase δεν έχει ρυθμιστεί');
  const base64 = await blobToBase64(image);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/extract_from_image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ image_base64: base64 }),
  });
  if (!res.ok) throw new Error('Extract function error');
  return res.json();
}

export async function suggestPriceViaEdge(input: { title: string; set?: string; condition?: string }): Promise<PriceSuggestResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase δεν έχει ρυθμιστεί');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/price_suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Price suggest function error');
  return res.json();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
  }
  return btoa(binary);
}


