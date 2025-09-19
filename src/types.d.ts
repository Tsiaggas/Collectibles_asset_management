// Ambient type declarations

// file-saver lacks bundled types in our setup
declare module 'file-saver';

// Vite import.meta.env typings (minimal)
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
