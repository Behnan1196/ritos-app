'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 7 ekim — v1 şema: Ritos'un kendi Supabase projesi (yalnız Ritos'a ait; tablolar öneksiz).
// Anahtar: yeni "publishable" anahtar (sb_publishable_…). Eski "anon" anahtarı da çalışır.
// Oturum belirteci tarayıcıda saklanır (kişisel içerik değil).
let istemci: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (istemci) return istemci;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anahtar || typeof window === 'undefined') return null;
  istemci = createClient(url, anahtar, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ritos-oturum' } });
  return istemci;
}

/**
 * Eski (cat_, şifreli) paylaşım katmanı: Gelenler, bildirim kuyruğu, dış uygulama kartları.
 * Yeni projede bu tablolar yok; v1 tablolarıyla yeniden kurulana kadar kapalı (null döner,
 * çağıranlar "sunucu yok" gibi sessizce geçer).
 */
export function eskiSupabase(): SupabaseClient | null {
  return null;
}
