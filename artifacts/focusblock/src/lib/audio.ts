let ctx: AudioContext | null = null;
let alarmInterval: ReturnType<typeof setInterval> | null = null;
let alarmTimeout: ReturnType<typeof setTimeout> | null = null;
// Bumped on every start/stop so a deferred resume() can't ring after a stop.
let alarmGen = 0;

// Keep ringing until acknowledged, but never longer than a minute so a missed
// alert doesn't beep forever.
const ALARM_DURATION_MS = 60_000;
// Gap between repeats. The beep cluster is ~0.8s, so this leaves a short pause.
const ALARM_INTERVAL_MS = 1200;

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

const ringOnce = () => {
  try {
    const c = getCtx();
    if (c.state === "suspended") {
      const gen = alarmGen;
      c.resume()
        .then(() => {
          // Skip if the alarm was stopped while resume() was pending.
          if (gen === alarmGen) scheduleBeeps(c);
        })
        .catch(() => {});
    } else {
      scheduleBeeps(c);
    }
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

// Start the end-of-session alarm: ring immediately, then repeat until either
// stopAlertTone() is called (user acknowledges) or a minute has elapsed.
export const playAlertTone = () => {
  stopAlertTone();
  ringOnce();
  alarmInterval = setInterval(ringOnce, ALARM_INTERVAL_MS);
  alarmTimeout = setTimeout(stopAlertTone, ALARM_DURATION_MS);
};

// Silence a ringing alarm. Safe to call any time (idempotent).
export const stopAlertTone = () => {
  alarmGen++;
  if (alarmInterval !== null) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (alarmTimeout !== null) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
};

const scheduleBeeps = (c: AudioContext) => {
  const t = c.currentTime;
  beep(c, t,        880, 0.18);
  beep(c, t + 0.25, 880, 0.18);
  beep(c, t + 0.50, 1100, 0.30);
};
