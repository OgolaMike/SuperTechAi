export type AlertMode = 'full' | 'bubble' | 'muted';
export type AlertCategory = 'signals' | 'targets' | 'stops' | 'limitOrders' | 'pendingOrders' | 'superSignals' | 'income' | 'business';
export const ALERT_CATEGORIES: { key: AlertCategory; label: string; description: string }[] = [
  { key: 'superSignals', label: 'Super Signals', description: 'All eight timeframes agree.' },
  { key: 'signals', label: 'BUY and SELL signals', description: 'New confirmed signals and reversals.' },
  { key: 'limitOrders', label: 'Strategy setups', description: 'Limit opportunities and strategy confirmations.' },
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
const STORAGE_KEY = 'supertech-alert-controls-v1';
export function loadAlertModes(): AlertModeSettings {
  const fallback: AlertModeSettings = { categories: { ...DEFAULT_ALERT_MODES }, assets: {}, defaultAssetMode: 'bubble' };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const valid = (value: unknown): value is AlertMode => value === 'full' || value === 'bubble' || value === 'muted';
    const categories = { ...fallback.categories };
    for (const item of ALERT_CATEGORIES) if (valid(raw.categories?.[item.key])) categories[item.key] = raw.categories[item.key];
    const assets: Record<string, AlertMode> = {};
    if (raw.assets && typeof raw.assets === 'object') for (const [symbol, mode] of Object.entries(raw.assets)) if (valid(mode)) assets[symbol] = mode;
    return { categories, assets, defaultAssetMode: valid(raw.defaultAssetMode) ? raw.defaultAssetMode : 'bubble' };
  } catch { return fallback; }
}
export function saveAlertModes(settings: AlertModeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('supertech-alert-controls-changed'));
}
export function getAlertMode(category: AlertCategory, symbol?: string): AlertMode {
  const settings = loadAlertModes();
  const categoryMode = settings.categories[category] ?? 'bubble';
  const assetMode = symbol ? settings.assets[symbol] ?? settings.defaultAssetMode : 'full';
  if (categoryMode === 'muted' || assetMode === 'muted') return 'muted';
  return categoryMode === 'full' && assetMode === 'full' ? 'full' : 'bubble';
}
