import type { CardItem } from "../types";

// Official eBay category for "Sports Trading Card Singles"
const EBAY_CATEGORY_ID = '261328';

// Mapping our user-friendly condition names to eBay's required numeric IDs
// Graded cards are not supported yet, so we focus on raw card conditions.
const conditionMap: { [key: string]: string } = {
  // Key is lowercase of our app's condition
  'gem mint': '1000', // Graded
  'mint': '1000', // Graded
  'near mint or better': '2500', // Ungraded
  'near mint': '2500', // Ungraded
  'excellent': '4000', // Ungraded
  'very good': '5000', // Ungraded,
  'poor': '7000', // Ungraded
  'lp': '4000', // Assuming LP (Lightly Played) is Excellent
  'nm': '2500', // Ungraded
};
const DEFAULT_CONDITION_ID = '2500'; // Default to Near Mint for Ungraded

// Function to generate the CSV content as a string
export function generateEbayCsv(items: CardItem[], usdRate: number | null): string {
  const headers = [
    'Action',
    'Custom label (SKU)',
    'Category',
    'Title',
    'Condition',
    'Condition description',
    'Item description',
    'Format',
    'Duration',
    'Price',
    'Quantity',
    'Item Photo URL',
    'Location',
    'ShippingProfileName',
    'ReturnProfileName',
    'PaymentProfileName',
    'Relationship',
    'Relationship details',
    // Item Specifics will be added dynamically
  ];
  
  // Find all unique item specifics keys across all selected items
  const allSpecifics = new Set<string>(['Graded']); // Always include Graded
  items.forEach(item => {
    if (item.team) allSpecifics.add('Team');
    if (item.set) allSpecifics.add('Set');
    if (item.numbering) allSpecifics.add('Card Number');
  });

  const specificsHeaders = Array.from(allSpecifics).map(s => `Item specifics[${s}]`);
  const fullHeaders = [...headers, ...specificsHeaders];

  const rows = items.map(item => {
    // Combine all image URLs, separated by '|'
    const imageUrls = [
      item.image_url_front,
      item.image_url_back,
      ...(item.extra_image_urls || [])
    ].filter(Boolean).join('|');

    const conditionId = conditionMap[item.condition?.toLowerCase() ?? ''] || DEFAULT_CONDITION_ID;

    // -->> ΝΕΟ: Υπολογισμός τιμής σε USD για το eBay
    let priceForEbay: string | number = '';
    if (item.price != null && usdRate != null) {
      priceForEbay = (item.price * usdRate).toFixed(2);
    }

    const row: { [key: string]: string | number } = {
      'Action': 'Add',
      'Custom label (SKU)': item.id,
      'Category': EBAY_CATEGORY_ID,
      'Title': item.title,
      'Condition': conditionId,
      'Condition description': item.condition ?? '',
      'Item description': item.notes ?? `Please see photos for card condition. Card sold as is.`,
      'Format': 'FixedPrice',
      'Duration': 'GTC', // Good 'Til Cancelled
      'Price': priceForEbay,
      'Quantity': 1,
      'Item Photo URL': imageUrls,
      'Location': 'Serres, Greece', // More specific location
      'ShippingProfileName': 'International Shipping', // MUST MATCH your eBay Business Policy Name
      'ReturnProfileName': 'Returns', // MUST MATCH your eBay Business Policy Name
      'PaymentProfileName': 'Payment', // MUST MATCH your eBay Business Policy Name
      'Relationship': '',
      'Relationship details': '',
      'Item specifics[Graded]': 'No',
      'Item specifics[Team]': item.team ?? '',
      'Item specifics[Set]': item.set ?? '',
      'Item specifics[Card Number]': item.numbering ?? '',
    };

    // Map the row object to the correct header order
    return fullHeaders.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',');
  });

  return [fullHeaders.join(','), ...rows].join('\n');
}
