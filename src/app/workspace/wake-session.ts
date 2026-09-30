export type LightMode = "sunrise" | "sunset";
export type Soundscape = "silent" | "waves" | "birds";

export function lightFrame(mode: LightMode, elapsedMs: number, durationMs: number, maximum: number) {
  const progress = Math.min(1, Math.max(0, elapsedMs / Math.max(1, durationMs)));
  const phase = mode === "sunrise" ? progress : 1 - progress;
  const light = phase * phase * (3 - 2 * phase);
  return { progress, light, brightness: light * Math.min(1, Math.max(0, maximum)), remainingSeconds: Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000)) };
}

// Original synthesis: no downloaded recordings, tracking, or sound licensing dependencies.
export function startSoundscape(sound: Exclude<Soundscape, "silent">) {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const ready = context.resume();
  if (sound === "waves") {
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const swell = context.createGain();
    swell.gain.value = 0.35;
    const tide = context.createOscillator();
    tide.frequency.value = 0.1;
    const depth = context.createGain();
    depth.gain.value = 0.25;
    tide.connect(depth).connect(swell.gain);
    noise.connect(filter).connect(swell).connect(master);
    noise.start();
    tide.start();
  } else {
    const chirp = () => {
      if (stopped || context.state !== "running") return;
      const now = context.currentTime;
      for (let i = 0; i < 3; i++) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const start = now + i * 0.19;
        oscillator.frequency.setValueAtTime(1700 + Math.random() * 300, start);
        oscillator.frequency.exponentialRampToValueAtTime(3200, start + 0.08);
        oscillator.frequency.exponentialRampToValueAtTime(1900, start + 0.15);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(0.18, start + 0.02);
        envelope.gain.linearRampToValueAtTime(0, start + 0.16);
        oscillator.connect(envelope).connect(master);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      }
    };
    void ready.then(chirp).catch(() => undefined);
    interval = setInterval(chirp, 3500);
  }
  return {
    ready,
    mute(muted: boolean) { if (!stopped) master.gain.setTargetAtTime(muted ? 0 : 0.12, context.currentTime, 0.08); },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      master.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
