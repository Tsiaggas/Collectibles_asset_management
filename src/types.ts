export type PlatformFlags = {
  vinted: boolean;
  vendora: boolean;
  ebay: boolean;
};

export type CardStatus = 'New' | 'Available' | 'Listed' | 'Inactive' | 'Sold';

export interface CardItem {
  id: string;
  kind?: 'Single' | 'Lot';
  team?: string;
  title: string;
  set?: string;
  condition?: string;
  price?: number;
  platforms: PlatformFlags;
  status: CardStatus;
  imageUrl?: string;
  notes?: string;
  createdAt: string; // ISO string
}

export interface Filters {
  query: string;
  status: 'All' | CardStatus;
  platforms: Partial<PlatformFlags> & { onlyChecked: boolean };
  kind?: 'All' | 'Single' | 'Lot';
  team?: 'All' | string;
}

export type JsonExport = {
  version: 1;
  exportedAt: string;
  items: CardItem[];
};

export const DEFAULT_PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e5e7eb"/><stop offset="100%" stop-color="#d1d5db"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-size="20">No Image</text>` +
    `</svg>`
  );

export const nextStatus = (status: CardStatus): CardStatus => {
  switch (status) {
    case 'New':
      return 'Available';
    case 'Available':
      return 'Listed';
    case 'Listed':
      return 'Sold';
    case 'Sold':
      return 'Inactive';
    case 'Inactive':
    default:
      return 'Available';
  }
};


