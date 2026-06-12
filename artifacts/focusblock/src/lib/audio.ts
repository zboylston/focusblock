let ctx: AudioContext | null = null;
let alarmInterval: ReturnType<typeof setInterval> | null = null;
let alarmTimeout: ReturnType<typeof setTimeout> | null = null;
let alarmGen = 0;

const ALARM_DURATION_MS = 60_000;
// Longer gap so three gentle bells have room to breathe before repeating.
const ALARM_INTERVAL_MS = 6_000;

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

// A single meditative bell strike.
// Models two sine partials: the fundamental and a higher inharmonic overtone
// (ratio ≈ 2.76×, typical of metal bowls). Both decay exponentially — the
// overtone fades faster so the fundamental rings on, mimicking a real bell.
const bell = (
  c: AudioContext,
  startTime: number,
  freq: number,
  peakGain: number,
  decaySec: number,
) => {
  const strike = (partialFreq: number, partialGain: number, dur: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(partialFreq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(partialGain, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + dur);
  };

  strike(freq, peakGain, decaySec);
  strike(freq * 2.76, peakGain * 0.45, decaySec * 0.55);
};

// Three ascending bell strikes — C5 → E5 → G5 (major triad, soft and open).
// Each is slightly quieter than the last so it reads as a gentle fade-in chime.
const ringOnce = () => {
  try {
    const c = getCtx();
    const go = () => {
      const t = c.currentTime;
      bell(c, t + 0.0,  523.25, 0.28, 3.0);  // C5
      bell(c, t + 1.2,  659.25, 0.22, 3.2);  // E5
      bell(c, t + 2.4,  783.99, 0.18, 3.6);  // G5
    };
    if (c.state === "suspended") {
      const gen = alarmGen;
      c.resume()
        .then(() => { if (gen === alarmGen) go(); })
        .catch(() => {});
    } else {
      go();
    }
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

export const playAlertTone = () => {
  stopAlertTone();
  ringOnce();
  alarmInterval = setInterval(ringOnce, ALARM_INTERVAL_MS);
  alarmTimeout = setTimeout(stopAlertTone, ALARM_DURATION_MS);
};

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
