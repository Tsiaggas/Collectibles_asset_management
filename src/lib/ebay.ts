import type { CardItem } from "../types";

// Official eBay category for "Sports Trading Card Singles"
const EBAY_CATEGORY_ID = '261328';

// Mapping our user-friendly condition names to eBay's required numeric IDs
// Graded cards are not supported yet, so we focus on raw card conditions.
const conditionMap: { [key: string]: string } = {
  // Key is lowercase of our app's condition
  'gem mint': '1000', // Graded
  'mint': '1000', // Graded
  'near mint or better': '3000', // Ungraded - Changed from 2500 to 3000 (Very Good) based on eBay error 21916883
  'near mint': '3000', // Ungraded - Changed from 2500 to 3000
  'excellent': '4000', // Ungraded
  'very good': '5000', // Ungraded,
  'poor': '7000', // Ungraded
  'lp': '4000', // Assuming LP (Lightly Played) is Excellent
  'nm': '3000', // Ungraded - Changed from 2500 to 3000
};
const DEFAULT_CONDITION_ID = '3000'; // Default to Very Good for Ungraded, was 2500

// Function to generate the CSV content as a string
export function generateEbayCsv(items: CardItem[], usdRate: number | null): string {
  // Headers based on the official eBay template provided by the user.
  // This is the definitive structure.
  const headers = [
    '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CSVmaual=true)',
    '*Category',
    'Title',
    'CustomLabel',
    '*ConditionID',
    'ConditionDescription',
    'PicURL',
    '*StartPrice',
    '*Quantity',
    'Description',
    '*Format',
    '*Duration',
    '*Location',
    'ShippingProfileName',
    'ReturnProfileName',
    'PaymentProfileName',
    'Relationship',
    'RelationshipDetails',
    // Item Specifics (C:...) will be added dynamically below
  ];
  
  // Find all unique item specifics keys across all selected items
  const allSpecifics = new Set<string>(['Graded', 'Sport']); // Always include Graded and Sport (mandatory)
  items.forEach(item => {
    if (item.team) allSpecifics.add('Team');
    if (item.set) allSpecifics.add('Set');
    if (item.numbering) allSpecifics.add('Card Number');
  });

  // Per template, item specifics are prefixed with "C:"
  const specificsHeaders = Array.from(allSpecifics).map(s => `C:${s}`);
  const fullHeaders = [...headers, ...specificsHeaders];

  const rows = items.map(item => {
    // Combine all image URLs, separated by '|', ensure no empty URLs
    const validImageUrls = [
      item.image_url_front,
      item.image_url_back,
      ...(item.extra_image_urls || [])
    ].filter(url => url && url.trim().length > 0);

    if (validImageUrls.length === 0) {
      throw new Error(`No valid image URLs found for item: ${item.title}`);
    }

    const imageUrls = validImageUrls.join('|');

    const conditionId = conditionMap[item.condition?.toLowerCase() ?? ''] || DEFAULT_CONDITION_ID;

    let priceForEbay: string | number = '';
    if (item.price != null && item.price > 0 && usdRate != null && usdRate > 0) {
      priceForEbay = (item.price * usdRate).toFixed(2);
    }

    // Validate that we have a valid price before creating the row
    if (priceForEbay === '' || priceForEbay === 0) {
      throw new Error(`Invalid price for item: ${item.title}. Price must be greater than 0.`);
    }

    // This row object now maps directly to the official eBay template headers.
    const row: { [key: string]: string | number } = {
      '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CSVmaual=true)': 'Add',
      'CustomLabel': (item.id ?? '').trim() || `card-${Date.now()}`,
      '*Category': EBAY_CATEGORY_ID,
      'Title': (item.title ?? '').trim() || 'Untitled Card',
      '*ConditionID': conditionId,
      'ConditionDescription': ((item.condition ?? '').replace(/,/g, ' ')).trim(),
      'Description': ((item.notes ?? `Please see photos for card condition. Card sold as is.`).replace(/,|\n|\r/g, ' ')).trim(),
      '*Format': 'FixedPrice',
      '*Duration': 'GTC', // Good 'Til Cancelled
      '*StartPrice': priceForEbay,
      '*Quantity': 1,
      'PicURL': imageUrls || '', // Correct header for images. Cannot be empty.
      '*Location': 'Serres, Greece',
      'ShippingProfileName': 'International Shipping', // MUST MATCH your eBay Business Policy Name
      'ReturnProfileName': 'Returns', // MUST MATCH your eBay Business Policy Name
      'PaymentProfileName': 'Payment', // MUST MATCH your eBay Business Policy Name
      'Relationship': '',
      'RelationshipDetails': '',
      'C:Graded': 'No',
      'C:Sport': 'Soccer', // Added mandatory Sport item specific. Default to Soccer.
      'C:Team': (item.team ?? '').trim() || '',
      'C:Set': (item.set ?? '').replace(/\//g, '-').trim() || '',
      'C:Card Number': (item.numbering ?? '').trim() || '',
    };

    // Map the row object to the correct header order
    return fullHeaders.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',');
  });

  // Use CRLF line endings (\r\n) for Windows/eBay compatibility.
  return [fullHeaders.join(','), ...rows].join('\r\n');
}
