export type AlertTone = 'BUY' | 'SELL' | 'TARGET' | 'STOP';

const TONES: Record<AlertTone, { from: number; to: number }> = {
  BUY: { from: 740, to: 1040 },
  SELL: { from: 420, to: 280 },
  TARGET: { from: 880, to: 1320 },
  STOP: { from: 330, to: 220 },
};

export function playAlertTone(tone: AlertTone) {
  const AudioContextClass = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const { from, to } = TONES[tone];
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(from, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(to, context.currentTime + 0.18);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.32);
  oscillator.addEventListener('ended', () => void context.close());
}
