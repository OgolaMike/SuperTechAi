import { supabase } from '@/lib/supabase';

export type AlertMode = 'full' | 'bubble' | 'muted';
export type AlertCategory = 'signals' | 'targets' | 'stops' | 'limitOrders' | 'pendingOrders' | 'superSignals' | 'income' | 'business';
export const ALERT_CATEGORIES: { key: AlertCategory; label: string; description: string }[] = [
  { key: 'superSignals', label: 'Super Signals', description: 'All eight timeframes agree.' },
  { key: 'signals', label: 'BUY and SELL signals', description: 'New confirmed signals and reversals.' },
  { key: 'limitOrders', label: 'Strategy setups', description: 'Break & Retest and other strategy confirmations.' },
  { key: 'pendingOrders', label: 'Pending orders', description: 'New setups, entries and order outcomes.' },
  { key: 'targets', label: 'Take-profit updates', description: 'TP1, TP2 and TP3 reached.' },
  { key: 'stops', label: 'Stop-loss updates', description: 'Stop-loss reached or updated.' },
  { key: 'income', label: 'Income updates', description: 'Commissions and earnings credited.' },
  { key: 'business', label: 'Business updates', description: 'Referrals and membership activity.' },
];
export const DEFAULT_ALERT_MODES: Record<AlertCategory, AlertMode> = {
  signals: 'bubble', targets: 'bubble', stops: 'bubble', limitOrders: 'bubble',
  pendingOrders: 'bubble', superSignals: 'bubble', income: 'bubble', business: 'bubble',
};
export type AlertModeSettings = {
  categories: Record<AlertCategory, AlertMode>;
  assets: Record<string, AlertMode>;
  defaultAssetMode: AlertMode;
};
const LEGACY_STORAGE_KEY = 'supertech-alert-controls-v1';
const validMode = (value: unknown): value is AlertMode => value === 'full' || value === 'bubble' || value === 'muted';
const emptySettings = (): AlertModeSettings => ({ categories: { ...DEFAULT_ALERT_MODES }, assets: {}, defaultAssetMode: 'bubble' });
const storageKey = (userId?: string) => userId ? `supertech-alert-controls-v1:${userId}` : LEGACY_STORAGE_KEY;

export function loadAlertModes(userId?: string): AlertModeSettings {
  const fallback = emptySettings();
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const categories = { ...fallback.categories };
    for (const item of ALERT_CATEGORIES) if (validMode(raw.categories?.[item.key])) categories[item.key] = raw.categories[item.key];
    const assets: Record<string, AlertMode> = {};
    if (raw.assets && typeof raw.assets === 'object') for (const [symbol, mode] of Object.entries(raw.assets)) if (validMode(mode)) assets[symbol] = mode;
    return { categories, assets, defaultAssetMode: validMode(raw.defaultAssetMode) ? raw.defaultAssetMode : 'bubble' };
  } catch { return fallback; }
}

export function cacheAlertModes(settings: AlertModeSettings, userId?: string): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(settings));
  window.dispatchEvent(new Event('supertech-alert-controls-changed'));
}

export async function loadMemberAlertModes(userId: string): Promise<AlertModeSettings> {
  const { data, error } = await supabase.from('member_alert_preferences')
    .select('categories, assets, default_asset_mode').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return loadAlertModes(userId);
  const raw = {
    categories: data.categories,
    assets: data.assets,
    defaultAssetMode: data.default_asset_mode,
  };
  const fallback = emptySettings();
  const categories = { ...fallback.categories };
  for (const item of ALERT_CATEGORIES) if (validMode(raw.categories?.[item.key])) categories[item.key] = raw.categories[item.key];
  const assets: Record<string, AlertMode> = {};
  if (raw.assets && typeof raw.assets === 'object' && !Array.isArray(raw.assets)) {
    for (const [symbol, mode] of Object.entries(raw.assets)) if (validMode(mode)) assets[symbol] = mode;
  }
  const settings = { categories, assets, defaultAssetMode: validMode(raw.defaultAssetMode) ? raw.defaultAssetMode : 'bubble' };
  cacheAlertModes(settings, userId);
  return settings;
}

export async function saveMemberAlertModes(settings: AlertModeSettings, userId: string): Promise<void> {
  const { error } = await supabase.from('member_alert_preferences').upsert({
    user_id: userId,
    categories: settings.categories,
    assets: settings.assets,
    default_asset_mode: settings.defaultAssetMode,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  cacheAlertModes(settings, userId);
}

export function getAlertMode(category: AlertCategory, symbol?: string, userId?: string): AlertMode {
  const settings = loadAlertModes(userId);
  const categoryMode = settings.categories[category] ?? 'bubble';
  const assetMode = symbol ? settings.assets[symbol] ?? settings.defaultAssetMode : 'full';
  if (categoryMode === 'muted' || assetMode === 'muted') return 'muted';
  return categoryMode === 'full' && assetMode === 'full' ? 'full' : 'bubble';
}
