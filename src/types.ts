export type PlatformFlags = {
  vinted: boolean;
  vendora: boolean;
  ebay: boolean;
};

export type CardStatus = 'New' | 'Available' | 'Listed' | 'Inactive' | 'Sold' | 'Queued';

export interface CardItem {
  id: string;
  kind?: 'Single' | 'Lot';
  team?: string;
  numbering?: string; // π.χ. "/99" ή "base"
  title: string;
  set?: string;
  condition?: string;
  price?: number;
  platforms: PlatformFlags;
  status: CardStatus;
  image_url_front?: string;
  image_url_back?: string;
  extra_image_urls?: string[]; // Λίστα για τις έξτρα εικόνες
  notes?: string;
  createdAt: string; // ISO string
}

export type Filters = {
  query: string;
  status: 'All' | CardStatus;
  platforms: Partial<PlatformFlags> & { onlyChecked?: boolean };
  kind?: 'All' | 'Single' | 'Lot';
  team?: 'All' | string;
  numbering?: 'All' | string;
};

export type JsonExport = {
  version: 1;
  exportedAt: string;
  items: CardItem[];
};

export const BUCKET_NAME = 'filacollectibles';
export const DEFAULT_PLACEHOLDER_IMAGE = 'https://app.filamvp.com/placeholder.png';

export const nextStatus = (s: CardStatus): CardStatus => {
  if (s === 'New') return 'Available';
  if (s === 'Available') return 'Listed';
  if (s === 'Listed') return 'Sold';
  if (s === 'Sold') return 'Inactive';
  if (s === 'Inactive') return 'Available';
  return 'Queued';
};


