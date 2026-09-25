'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Ritos, Rite'ın Supabase projesini kullanır ama yalnızca cat_ tablolarına dokunur.
// Oturum belirteci tarayıcıda saklanır (kişisel içerik değil).
let istemci: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (istemci) return istemci;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anahtar || typeof window === 'undefined') return null;
  istemci = createClient(url, anahtar, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ritos-oturum' } });
  return istemci;
}
