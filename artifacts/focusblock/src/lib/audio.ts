let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

export const primeAudio = () => {
  try {
    const c = getCtx();
    if (c.state === "suspended") c.resume();
  } catch (_) {}
};

const beep = (c: AudioContext, startTime: number, freq: number, duration: number) => {
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
  gain.gain.setValueAtTime(0.6, startTime + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
};

export const playAlertTone = () => {
  try {
    const c = getCtx();
    if (c.state === "suspended") {
      c.resume().then(() => scheduleBeeps(c));
    } else {
      scheduleBeeps(c);
    }
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

const scheduleBeeps = (c: AudioContext) => {
  const t = c.currentTime;
  beep(c, t,        880, 0.18);
  beep(c, t + 0.25, 880, 0.18);
  beep(c, t + 0.50, 1100, 0.30);
};
