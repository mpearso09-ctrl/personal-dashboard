'use client';

import { useState, useEffect } from 'react';

// ─── USD → CAD exchange rate ────────────────────────────────────────────────
// Live daily rate from open.er-api.com (free, no key, CORS-enabled).
// Cached in localStorage per day; falls back to last known rate, then a
// hardcoded default, if the API is unreachable.

const FALLBACK_RATE = 1.37;
const CACHE_KEY = 'usdcad_rate_v1';

export type Currency = 'CAD' | 'USD';

export interface FxState {
  /** CAD per 1 USD */
  rate: number;
  /** true when the rate is today's live rate */
  isLive: boolean;
  /** YYYY-MM-DD the rate is from, or null for the hardcoded fallback */
  asOf: string | null;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function readCache(): { rate: number; date: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.rate === 'number' && typeof parsed?.date === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(rate: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, date: todayStr() }));
  } catch {
    // ignore
  }
}

export async function fetchUsdCadRate(): Promise<FxState> {
  const cached = readCache();
  if (cached && cached.date === todayStr()) {
    return { rate: cached.rate, isLive: true, asOf: cached.date };
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    const rate = json?.rates?.CAD;
    if (typeof rate === 'number' && rate > 0) {
      writeCache(rate);
      return { rate, isLive: true, asOf: todayStr() };
    }
  } catch {
    // fall through to cache / fallback
  }
  if (cached) return { rate: cached.rate, isLive: false, asOf: cached.date };
  return { rate: FALLBACK_RATE, isLive: false, asOf: null };
}

/** React hook: USD→CAD rate, fetched once on mount. */
export function useUsdCad(): FxState {
  const [state, setState] = useState<FxState>(() => {
    return { rate: FALLBACK_RATE, isLive: false, asOf: null };
  });
  useEffect(() => {
    let cancelled = false;
    fetchUsdCadRate().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Convert an amount between CAD and USD given the CAD-per-USD rate. */
export function convert(amount: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return amount;
  return from === 'USD' ? amount * rate : amount / rate;
}

/** Convert an amount in the account's native currency to CAD. */
export function toCad(amount: number, currency: Currency, rate: number): number {
  return currency === 'USD' ? amount * rate : amount;
}
