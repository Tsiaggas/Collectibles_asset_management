import React, { useEffect, useMemo, useState } from 'react';
import type { CardItem, CardStatus, Filters } from './types';
import { DEFAULT_PLACEHOLDER_IMAGE, nextStatus } from './types';
import { parseBulk, toCardItems } from './lib/parse';
import { hasSupabase, supabase, rowToItem, itemToInsert, itemToUpdate } from './lib/supabase';
// Drive integration removed for simplicity per user request
import { Modal } from './components/Modal';
import { Toast, ToastData } from './components/Toast';
import { Checkbox, Select, TextArea, TextInput } from './components/Inputs';
import { ImageUploader } from './components/ImageUploader';

const DEFAULT_DRIVE_FOLDER = 'CardInventory_MVP';

// Demo seed removed: όλα τα δεδομένα προέρχονται από Supabase

type EditState = { open: boolean; item?: CardItem };

export const App: React.FC = () => {
  const [items, setItems] = useState<CardItem[]>([]);
  const [filters, setFilters] = useState<Filters>({
    query: '',
    status: 'All',
    platforms: { onlyChecked: false },
    kind: 'All',
    team: 'All',
    numbering: 'All',
  });
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [numberingOptions, setNumberingOptions] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  // Bulk images & AI removed for simplicity
  const [edit, setEdit] = useState<EditState>({ open: false });
  const [toast, setToast] = useState<ToastData | null>(null);
  // Drive state removed

  // Φόρτωση αποκλειστικά από Supabase
  useEffect(() => {
    (async () => {
      if (!hasSupabase) {
        setItems([]);
        setToast({ message: 'Δεν έχει ρυθμιστεί Supabase (VITE_SUPABASE_URL/ANON_KEY)', type: 'error' });
        return;
      }
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        setToast({ message: 'Σφάλμα φόρτωσης από Supabase', type: 'error' });
        setItems([]);
        return;
      }
      setItems((data ?? []).map(rowToItem));
    })();
  }, []);

  // Αφαιρέθηκε κάθε συγχρονισμός με localStorage

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return items.filter((it) => {
      if (filters.status !== 'All' && it.status !== filters.status) return false;
      if (filters.kind && filters.kind !== 'All') {
        if ((it.kind ?? 'Single') !== filters.kind) return false;
      }
      if (filters.team && filters.team !== 'All') {
        if ((it.team ?? '').toLowerCase() !== filters.team.toLowerCase()) return false;
      }
      if (filters.numbering && filters.numbering !== 'All') {
        if (it.numbering !== filters.numbering) return false;
      }
      if (filters.platforms.onlyChecked) {
        const pf = filters.platforms;
        if (pf.vinted && !it.platforms.vinted) return false;
        if (pf.vendora && !it.platforms.vendora) return false;
        if (pf.ebay && !it.platforms.ebay) return false;
      }
      if (!q) return true;
      const hay = `${it.title} ${it.team ?? ''} ${it.set ?? ''} ${it.notes ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filters]);

  // derive team options from data
  useEffect(() => {
    const teams = Array.from(new Set(items.map((i) => (i.team || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    setTeamOptions(teams);
  }, [items]);

  // derive numbering options from data
  useEffect(() => {
    const numberings = Array.from(new Set(items.map((i) => (i.numbering || '').trim()).filter(Boolean))).sort();
    setNumberingOptions(numberings);
  }, [items]);

  async function addItem(newItem: Omit<CardItem, 'id' | 'createdAt'>) {
    if (!hasSupabase) { setToast({ message: 'Supabase δεν έχει ρυθμιστεί', type: 'error' }); return; }
    // Upsert με μοναδικότητα στο title_norm (server-side dedupe)
    const { data, error } = await supabase
      .from('cards')
      .upsert(itemToInsert(newItem), { onConflict: 'title_norm', ignoreDuplicates: true })
      .select('*');
    if (error) {
      // Fallback για παλιό schema χωρίς kind/team
      const minimal: any = itemToInsert(newItem);
      delete minimal.kind;
      delete minimal.team;
      const { data: data2, error: error2 } = await supabase
        .from('cards')
        .upsert(minimal, { onConflict: 'title_norm', ignoreDuplicates: true })
        .select('*');
      if (!error2) {
        if ((data2?.length ?? 0) > 0) {
          setItems((prev) => [ ...(data2 ?? []).map(rowToItem as any), ...prev ]);
          return;
        }
        setToast({ message: 'Υπάρχει ήδη κάρτα με αυτόν τον τίτλο — έγινε skip', type: 'info' });
        return;
      }
      setToast({ message: 'Αποτυχία προσθήκης στη Supabase', type: 'error' });
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setToast({ message: 'Υπάρχει ήδη κάρτα με αυτόν τον τίτλο — έγινε skip', type: 'info' });
      return;
    }
    setItems((prev) => [ ...(data ?? []).map(rowToItem), ...prev ]);
  }

  async function updateItem(updated: CardItem) {
    if (!hasSupabase) { setToast({ message: 'Supabase δεν έχει ρυθμιστεί', type: 'error' }); return; }
    let { error } = await supabase.from('cards').update(itemToUpdate(updated)).eq('id', updated.id);
    if (error) {
      const minimal: any = itemToUpdate(updated);
      delete minimal.kind;
      delete minimal.team;
      const { error: error2 } = await supabase.from('cards').update(minimal).eq('id', updated.id);
      if (error2) {
        setToast({ message: 'Αποτυχία ενημέρωσης στη Supabase', type: 'error' });
      }
    }
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }

  async function deleteItem(id: string) {
    if (!hasSupabase) { setToast({ message: 'Supabase δεν έχει ρυθμιστεί', type: 'error' }); return; }
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) { setToast({ message: 'Αποτυχία διαγραφής στη Supabase', type: 'error' }); return; }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function exportJson() {
    const blob = new Blob([
      JSON.stringify({ version: 1 as const, exportedAt: new Date().toISOString(), items }, null, 2),
    ], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `card-inventory-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel() {
    const { utils, writeFile } = await import('xlsx');
    const rows = items.map((it) => ({
      id: it.id,
      kind: it.kind ?? 'Single',
      team: it.team ?? '',
      title: it.title,
      set: it.set ?? '',
      condition: it.condition ?? '',
      price: it.price ?? '',
      vinted: it.platforms.vinted,
      vendora: it.platforms.vendora,
      ebay: it.platforms.ebay,
      status: it.status,
      imageUrl: it.imageUrl ?? '',
      notes: it.notes ?? '',
      createdAt: it.createdAt,
    }));
    const sheet = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, sheet, 'Cards');
    writeFile(wb, `card-inventory-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function importJson(file: File) {
    if (!hasSupabase) { setToast({ message: 'Supabase δεν έχει ρυθμιστεί', type: 'error' }); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const list: any[] = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
        if (!Array.isArray(list) || list.length === 0) { setToast({ message: 'Το JSON δεν περιέχει items', type: 'error' }); return; }
        // Skip διπλότυπα ως προς title (υπάρχοντα και εντός JSON)
        const normalize = (s: string) => (s || '').trim().toLowerCase();
        const existingTitles = new Set(items.map((it) => normalize(it.title)));
        const seenInBatch = new Set<string>();
        const filteredList = list.filter((i) => {
          const t = normalize(i?.title || '');
          if (!t) return false;
          if (existingTitles.has(t)) return false;
          if (seenInBatch.has(t)) return false;
          seenInBatch.add(t);
          return true;
        });
        if (filteredList.length === 0) { setToast({ message: 'Όλα τα JSON items ήταν διπλότυπα τίτλου — δεν έγινε εισαγωγή', type: 'info' }); return; }
        const skipped = list.length - filteredList.length;
        const toInsert = filteredList.map((i) => itemToInsert({
          kind: i.kind ?? 'Single',
          team: i.team ?? undefined,
          title: String(i.title ?? '').trim(),
          set: i.set ?? undefined,
          condition: i.condition ?? undefined,
          price: i.price ?? undefined,
          platforms: i.platforms ?? { vinted: false, vendora: false, ebay: false },
          status: i.status ?? 'Available',
          imageUrl: i.imageUrl ?? undefined,
          notes: i.notes ?? undefined,
        }));
        const { data, error } = await supabase
          .from('cards')
          .upsert(toInsert, { onConflict: 'title_norm', ignoreDuplicates: true })
          .select('*');
        if (error) { setToast({ message: 'Σφάλμα κατά το import στη Supabase', type: 'error' }); return; }
        setItems((prev) => [ ...(data ?? []).map(rowToItem), ...prev ]);
        const skippedByDb = toInsert.length - (data?.length ?? 0);
        const totalSkipped = skippedByDb + skipped;
        setToast({ message: `Import ολοκληρώθηκε (${data?.length ?? 0})${totalSkipped > 0 ? ` (skip ${totalSkipped} διπλότυπα)` : ''}`, type: 'success' });
      } catch {
        setToast({ message: 'Σφάλμα στο import JSON', type: 'error' });
      }
    };
    reader.readAsText(file);
  }

  async function doBulkImport() {
    if (!hasSupabase) { setToast({ message: 'Supabase δεν έχει ρυθμιστεί', type: 'error' }); return; }
    const rows = parseBulk(bulkText);
    const newItems = toCardItems(rows);
    if (newItems.length === 0) {
      setToast({ message: 'Δεν βρέθηκαν έγκυρες γραμμές', type: 'info' });
      return;
    }
    // Skip διπλότυπα με βάση τον τίτλο (σε σχέση με υπάρχοντα και εντός του ίδιου import)
    const normalize = (s: string) => s.trim().toLowerCase();
    const existingTitles = new Set(items.map((i) => normalize(i.title)));
    const seenInBatch = new Set<string>();
    const uniqueNewItems = newItems.filter((i) => {
      const t = normalize(i.title);
      if (!t) return false;
      if (existingTitles.has(t)) return false;
      if (seenInBatch.has(t)) return false;
      seenInBatch.add(t);
      return true;
    });
    if (uniqueNewItems.length === 0) {
      setToast({ message: 'Όλες οι γραμμές ήταν διπλότυπες τίτλου — δεν έγινε εισαγωγή', type: 'info' });
      return;
    }
    const skipped = newItems.length - uniqueNewItems.length;
    const payload = uniqueNewItems.map((ni) => itemToInsert(ni));
    const { data, error } = await supabase
      .from('cards')
      .upsert(payload, { onConflict: 'title_norm', ignoreDuplicates: true })
      .select('*');
    if (error) { setToast({ message: 'Σφάλμα import στη Supabase', type: 'error' }); return; }
    setItems((prev) => [ ...(data ?? []).map(rowToItem), ...prev ]);
    setBulkText('');
    setBulkOpen(false);
    const skippedByDb = payload.length - (data?.length ?? 0);
    const totalSkipped = skipped + skippedByDb;
    setToast({ message: `Έγινε import ${data?.length ?? 0} καρτών${totalSkipped > 0 ? ` (skip ${totalSkipped} διπλότυπα)` : ''}`, type: 'success' });
  }

  // Drive functions removed

  const statusOptions: CardStatus[] = ['New', 'Available', 'Listed', 'Inactive', 'Sold'];

  const handleCheckPrice = (title: string) => {
    if (!title) return;
    navigator.clipboard.writeText(title).then(() => {
      setToast({ message: 'Card title copied to clipboard!', type: 'success' });
      window.open('https://130point.com/sales/', '_blank');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      setToast({ message: 'Failed to copy title.', type: 'error' });
    });
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Card Inventory MVP</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill bg-gray-200 dark:bg-gray-700">{hasSupabase ? 'Mode: Supabase' : 'Supabase: not configured'}</span>
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>Upload Images</button>
          <button className="btn" onClick={() => setBulkOpen(true)}>Bulk import</button>
          {/* Bulk images removed */}
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <button className="btn" onClick={exportExcel}>Export Excel</button>
          <label className="btn cursor-pointer">
            Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.currentTarget.value = '';
            }}/>
          </label>
          {/* Drive buttons removed */}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextInput placeholder="Αναζήτηση τίτλου/σετ/σημειώσεων/ομάδας" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}>
          <option value="All">All</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as Filters['kind'] })}>
          <option value="All">All kinds</option>
          <option value="Single">Single</option>
          <option value="Lot">Lot</option>
        </Select>
        <Select value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value as Filters['team'] })}>
          <option value="All">All teams</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select value={filters.numbering} onChange={(e) => setFilters({ ...filters, numbering: e.target.value })}>
          <option value="All">All numberings</option>
          {numberingOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2"><Checkbox checked={!!filters.platforms.vinted} onChange={(e) => setFilters({ ...filters, platforms: { ...filters.platforms, vinted: e.target.checked, onlyChecked: true } })}/>Vinted</label>
          <label className="inline-flex items-center gap-2"><Checkbox checked={!!filters.platforms.vendora} onChange={(e) => setFilters({ ...filters, platforms: { ...filters.platforms, vendora: e.target.checked, onlyChecked: true } })}/>Vendora</label>
          <label className="inline-flex items-center gap-2"><Checkbox checked={!!filters.platforms.ebay} onChange={(e) => setFilters({ ...filters, platforms: { ...filters.platforms, ebay: e.target.checked, onlyChecked: true } })}/>eBay</label>
        </div>
      </section>

      {/* Η φόρμα "Προσθήκη κάρτας" έχει αφαιρεθεί */}

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500">Δεν υπάρχουν κάρτες. Κάνε import ή ανέβασε μια εικόνα.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <li key={it.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <div className="aspect-[4/2.5] w-full bg-gray-100 dark:bg-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image_url_front || DEFAULT_PLACEHOLDER_IMAGE} alt={it.title} className="h-full w-full object-contain" />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-gray-500">{it.set || '—'} · {it.condition || '—'}</div>
                  </div>
                  <span className={`pill pill-${it.status}`}>{it.status}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold">{it.price != null ? `${it.price.toFixed(2)} €` : '—'}</div>
                  <div className="flex gap-1">
                    {it.platforms.vinted && <span className="pill bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200">Vinted</span>}
                    {it.platforms.vendora && <span className="pill bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Vendora</span>}
                    {it.platforms.ebay && <span className="pill bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">eBay</span>}
                  </div>
                </div>
                {it.team && <div className="text-xs text-emerald-700 dark:text-emerald-300">Team: {it.team}</div>}
                {it.numbering && <div className="text-xs font-bold text-sky-700 dark:text-sky-300">Numbering: {it.numbering}</div>}
                <div className="flex items-center gap-2">
                  <button className="btn" onClick={() => setEdit({ open: true, item: it })}>Edit</button>
                  <button className="btn" onClick={() => updateItem({ ...it, status: nextStatus(it.status) })}>Next status</button>
                  <button
                    onClick={() => handleCheckPrice(it.title || '')}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition-colors inline-flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8.433 7.418c.158-.103.346-.196.567-.267v1.698a2.5 2.5 0 00-.567-.267C8.07 8.34 8 8.444 8 8.5v3a.5.5 0 00.5.5h1a.5.5 0 00.5-.5v-3a.5.5 0 00-.433-.482z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a.5.5 0 00-1 0v.092a4.5 4.5 0 00-1.897 1.158l-.21.192a.5.5 0 00.638.764l.21-.192a3.5 3.5 0 011.26-1.022V7.5a.5.5 0 001 0V5z" clipRule="evenodd" />
                    </svg>
                    Check Price
                  </button>
                  <button className="btn" onClick={() => deleteItem(it.id)}>Delete</button>
                </div>
                <div className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</div>
                {/* Image upload to Drive removed for simplicity */}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={uploadOpen} title="Upload Card Images" onClose={() => setUploadOpen(false)}>
        <ImageUploader onComplete={() => setUploadOpen(false)} />
      </Modal>

      <Modal open={bulkOpen} title="Bulk Import" onClose={() => setBulkOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Δέχεται CSV/TSV/|-separated. Header προαιρετικό. Mapping: kind,title,set,condition,price,vinted,vendora,ebay,status,imageUrl,notes (όπου kind: Single ή Lot)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium">Παραδείγματα</div>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-100 dark:bg-gray-900 p-2 text-xs">
{`CSV με header
kind,title,set,condition,price,vinted,vendora,ebay,status,imageUrl,notes
Single,Pikachu,Base,LP,9.99,1,0,1,Listed,,yellow cheeks

Pipe-separated χωρίς header (με kind πρώτα)
Lot|Charizard|Base|NM|120|1|1|1|Available||holo

TSV με true/yes
Single\tGengar\tFossil\tLP\t39.9\tyes\ttrue\t0\tInactive\t\tshadow`}
              </pre>
            </div>
            <div className="flex flex-col gap-2">
              <TextArea rows={10} placeholder="Επικόλλησε εδώ..." value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn" onClick={() => setBulkText('')}>Καθαρισμός</button>
                <button className="btn btn-primary" onClick={doBulkImport}>Import</button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bulk images modal removed */}

      <Modal open={edit.open} title="Επεξεργασία" onClose={() => setEdit({ open: false })}>
        {edit.item && (
          <div className="space-y-4">
            {/* Image Previews & Download Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Front Image</label>
                <img src={edit.item.image_url_front || DEFAULT_PLACEHOLDER_IMAGE} alt="Front view" className="w-full rounded-lg object-contain border dark:border-gray-700" />
                {edit.item.image_url_front && <a href={edit.item.image_url_front} download target="_blank" rel="noopener noreferrer" className="btn w-full">Download Front</a>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Back Image</label>
                <img src={edit.item.image_url_back || DEFAULT_PLACEHOLDER_IMAGE} alt="Back view" className="w-full rounded-lg object-contain border dark:border-gray-700" />
                {edit.item.image_url_back && <a href={edit.item.image_url_back} download target="_blank" rel="noopener noreferrer" className="btn w-full">Download Back</a>}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput placeholder="Title" value={edit.item.title} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, title: e.target.value } })} />
              <TextInput placeholder="Set" value={edit.item.set ?? ''} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, set: e.target.value } })} />
              <TextInput placeholder="Team" value={edit.item.team ?? ''} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, team: e.target.value } })} />
              <TextInput placeholder="Condition" value={edit.item.condition ?? ''} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, condition: e.target.value } })} />
              <TextInput placeholder="Numbering" value={edit.item.numbering ?? ''} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, numbering: e.target.value } })} />
              <TextInput placeholder="Price" type="number" inputMode="decimal" value={edit.item.price ?? ''} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, price: e.target.value ? Number(e.target.value) : undefined } })} />
              <Select value={edit.item.status} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, status: e.target.value as CardStatus } })}>
                {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
              <Select value={edit.item.kind ?? 'Single'} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, kind: e.target.value as any } })}>
                <option value="Single">Single</option>
                <option value="Lot">Lot</option>
              </Select>
              <div className="sm:col-span-2">
                <TextArea 
                  placeholder="Notes" 
                  rows={8}
                  value={edit.item.notes ?? ''} 
                  onChange={(e) => setEdit({ open: true, item: { ...edit.item!, notes: e.target.value } })} 
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-4">
                <label className="inline-flex items-center gap-2"><input className="checkbox" type="checkbox" checked={edit.item.platforms.vinted} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, platforms: { ...edit.item!.platforms, vinted: e.target.checked } } })}/>Vinted</label>
                <label className="inline-flex items-center gap-2"><input className="checkbox" type="checkbox" checked={edit.item.platforms.vendora} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, platforms: { ...edit.item!.platforms, vendora: e.target.checked } } })}/>Vendora</label>
                <label className="inline-flex items-center gap-2"><input className="checkbox" type="checkbox" checked={edit.item.platforms.ebay} onChange={(e) => setEdit({ open: true, item: { ...edit.item!, platforms: { ...edit.item!.platforms, ebay: e.target.checked } } })}/>eBay</label>
              </div>
              {/* AI buttons removed for simplicity */}
              <div className="sm:col-span-2 flex gap-2">
                <button className="btn btn-primary" onClick={() => { updateItem(edit.item!); setEdit({ open: false }); }}>Αποθήκευση</button>
                <button className="btn" onClick={() => setEdit({ open: false })}>Άκυρο</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} setToast={setToast} />

      <footer className="mt-10 text-xs text-gray-500">
        {hasSupabase ? 'Δεδομένα αποθηκεύονται στο Supabase.' : 'Ρύθμισε VITE_SUPABASE_URL και VITE_SUPABASE_ANON_KEY για αποθήκευση στο Supabase.'}
      </footer>
    </div>
  );
};


