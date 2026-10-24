import { displayStore } from './display';

// نقرة لكل ضغطة، نغمة نجاح للحفظ، وتحذير مع كل رفض (ومعه رسالة ظاهرة دائماً).
// Web Audio بلا ملفات، والسياق ينخلق بأوّل ضغطة لأن المتصفّح يمنع الصوت قبل تفاعل.

type AudioCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!displayStore.get().sound || typeof window === 'undefined') return null;
  try {
    if (!context) {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch { // swallow-ok: بلا صوت؛ الرسالة الظاهرة تكفي
    return null;
  }
}

function tone(frequency: number, durationMs: number, type: OscillatorType, volume: number, delayMs = 0): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

export const sound = {
  click(): void {
    tone(1400, 22, 'square', 0.015);
  },
  success(): void {
    tone(660, 90, 'sine', 0.05);
    tone(990, 140, 'sine', 0.05, 90);
  },
  warn(): void {
    tone(330, 160, 'triangle', 0.07);
    tone(247, 220, 'triangle', 0.07, 170);
  },
};
