type SoundKind = 'draw' | 'claim' | 'ticket' | 'end';
type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

const MAX_VOICES = 8;
const voices: Voice[] = [];
let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let visibilityInstalled = false;

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function release(voice: Voice): void {
  const index = voices.indexOf(voice);
  if (index >= 0) voices.splice(index, 1);
  try { voice.oscillator.disconnect(); } catch { /* already disconnected */ }
  try { voice.gain.disconnect(); } catch { /* already disconnected */ }
}

function stopVoices(): void {
  for (const voice of [...voices]) {
    try { voice.oscillator.stop(); } catch { /* already stopped */ }
    release(voice);
  }
}

function onVisibility(): void {
  if (!context) return;
  if (hidden()) {
    stopVoices();
    if (context.state === 'running') void context.suspend().catch(() => {});
  } else if (context.state !== 'closed') {
    void context.resume().catch(() => {});
  }
}

function unlock(): void {
  try {
    if (!context || context.state === 'closed') {
      const host = globalThis as typeof globalThis & {
        AudioContext?: AudioContextConstructor;
        webkitAudioContext?: AudioContextConstructor;
      };
      const Constructor = host.AudioContext ?? host.webkitAudioContext;
      if (!Constructor) return;
      context = new Constructor({ latencyHint: 'interactive' });
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.2;
      master.connect(context.destination);
      if (!visibilityInstalled && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
        visibilityInstalled = true;
      }
    }
    if (!hidden() && context.state !== 'running') void context.resume().catch(() => {});
  } catch {
    // Sound is optional when a browser has no usable audio context.
  }
}

function tone(frequency: number, delay: number, duration: number, volume = 0.13, glide?: number): void {
  const ctx = context;
  if (!ctx || !master || muted || hidden() || ctx.state !== 'running') return;
  if (voices.length >= MAX_VOICES) {
    const oldest = voices[0];
    try { oldest.oscillator.stop(); } catch { /* already stopped */ }
    release(oldest);
  }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const at = ctx.currentTime + delay;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, at);
  if (glide) oscillator.frequency.exponentialRampToValueAtTime(glide, at + duration * 0.75);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.045, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(master);
  const voice = { oscillator, gain };
  voices.push(voice);
  oscillator.onended = () => release(voice);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function play(kind: SoundKind): void {
  if (muted || hidden() || !context || context.state !== 'running') return;
  try {
    switch (kind) {
      case 'draw':
        tone(660, 0, 0.17, 0.1);
        tone(990, 0.025, 0.12, 0.035);
        break;
      case 'claim':
        // Two quiet, overlapping tones make a short steam-whistle breath.
        tone(740, 0, 0.46, 0.1, 830);
        tone(1110, 0.055, 0.34, 0.025, 1245);
        tone(554.37, 0.38, 0.27, 0.075);
        break;
      case 'ticket':
        tone(523.25, 0, 0.25, 0.085);
        tone(659.25, 0.12, 0.3, 0.085);
        tone(783.99, 0.25, 0.38, 0.075);
        break;
      case 'end':
        tone(392, 0, 0.6, 0.075);
        tone(493.88, 0.15, 0.55, 0.075);
        tone(587.33, 0.3, 0.65, 0.075);
        tone(783.99, 0.5, 0.75, 0.055);
        break;
    }
  } catch {
    // A reclaimed audio device must never block a game action.
  }
}

function setMuted(value: boolean): void {
  muted = !!value;
  if (muted) stopVoices();
  try { master?.gain.setTargetAtTime(muted ? 0 : 0.2, context?.currentTime ?? 0, 0.025); } catch { /* closed */ }
}

function dispose(): void {
  stopVoices();
  if (visibilityInstalled && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
    visibilityInstalled = false;
  }
  const previous = context;
  context = null;
  master = null;
  if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
}

export const audio = { unlock, setMuted, play, dispose };
