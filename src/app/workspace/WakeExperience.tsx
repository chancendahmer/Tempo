"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FiArrowRight, FiMaximize, FiMoon, FiPlay, FiSun, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
import { lightFrame, startSoundscape, type LightMode, type Soundscape } from "./wake-session";
import s from "./wake.module.css";

export function WakeExperience({ onRoutines }: { onRoutines: () => void }) {
  const [mode, setMode] = useState<LightMode>("sunrise");
  const [minutes, setMinutes] = useState(15);
  const [maximum, setMaximum] = useState(80);
  const [sound, setSound] = useState<Soundscape>("silent");
  const [session, setSession] = useState<{ started: number; duration: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("");
  const [wakeNotice, setWakeNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<ReturnType<typeof startSoundscape> | null>(null);
  const frame = lightFrame(mode, elapsed, session?.duration ?? minutes * 60_000, maximum / 100);
  const finished = !!session && frame.progress === 1;

  useEffect(() => {
    if (!session) return;
    dialog.current?.showModal();
    const timer = setInterval(() => setElapsed(Date.now() - session.started), 250);
    return () => { clearInterval(timer); audio.current?.stop(); audio.current = null; };
  }, [session]);
  useEffect(() => { if (finished) { audio.current?.stop(); audio.current = null; } }, [finished]);
  useEffect(() => {
    if (!session || finished) return;
    let disposed = false;
    let requesting = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || requesting || document.visibilityState !== "visible" || lock) return;
      requesting = true;
      try {
        if (!navigator.wakeLock) throw new Error("Unavailable");
        const requested = await navigator.wakeLock.request("screen");
        if (disposed) { await requested.release(); return; }
        lock = requested;
        setWakeNotice("Keeping your screen awake during this session.");
        requested.addEventListener("release", () => {
          lock = null;
          if (!disposed) setWakeNotice("Screen awake protection ended. Keep your device awake to continue.");
        }, { once: true });
      } catch {
        if (!disposed) setWakeNotice("This device cannot keep the screen awake automatically. Keep it awake for this session.");
      } finally {
        requesting = false;
      }
    };
    void acquire();
    const visible = () => { void acquire(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; document.removeEventListener("visibilitychange", visible); void lock?.release().catch(() => undefined); };
  }, [session, finished]);

  function stop() {
    audio.current?.stop();
    audio.current = null;
    dialog.current?.close();
    if (document.fullscreenElement === dialog.current) void document.exitFullscreen().catch(() => undefined);
    setSession(null);
  }
  function start(preview = false) {
    setNotice("");
    setWakeNotice("");
    setMuted(false);
    setElapsed(0);
    if (sound !== "silent") {
      try {
        const player = startSoundscape(sound);
        audio.current = player;
        void player.ready.catch(() => { player.stop(); setNotice("Sound could not start on this device. Your light session is still running."); });
      } catch { setNotice("Sound is unavailable on this device. Your light session is still running."); }
    }
    setSession({ started: Date.now(), duration: preview ? 20_000 : minutes * 60_000 });
  }

  return <div className={s.root}>
    <div className={s.choices} aria-label="Light session">
      <button className={`${s.choice} ${s.sunrise}`} aria-pressed={mode === "sunrise"} onClick={() => setMode("sunrise")}><span className={s.miniSun} aria-hidden="true" /><span><FiSun /> MORNING LIGHT</span><h2>Ease into your day.</h2><p>A soft glow becomes a warm, bright sunrise.</p><strong>{mode === "sunrise" ? "Selected" : "Choose sunrise"} <FiArrowRight /></strong></button>
      <button className={`${s.choice} ${s.sunset}`} aria-pressed={mode === "sunset"} onClick={() => setMode("sunset")}><span className={s.miniMoon} aria-hidden="true" /><span><FiMoon /> EVENING LIGHT</span><h2>Let the day settle.</h2><p>Golden light fades through amber into night.</p><strong>{mode === "sunset" ? "Selected" : "Choose sunset"} <FiArrowRight /></strong></button>
    </div>
    <section className={s.controls} aria-label="Session settings">
      <label>Take your time<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[5, 10, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
      <label>Maximum light <span>{maximum}%</span><input type="range" min="10" max="100" step="5" value={maximum} onChange={e => setMaximum(Number(e.target.value))} /></label>
      <label>Soundscape<select value={sound} onChange={e => setSound(e.target.value as Soundscape)}><option value="silent">Quiet · no sound</option><option value="waves">Ocean waves · synthesized</option><option value="birds">Morning birds · synthesized</option></select></label>
      <div className={s.actions}><button className={s.start} onClick={() => start()}><FiPlay /> Start {mode}</button><button className={s.preview} onClick={() => start(true)}>20-second preview</button></div>
    </section>
    <div className={s.note}><FiSun /><p><strong>Light for right now.</strong> Keep this screen open and your device awake. This changes screen colors, not hardware brightness. Scheduled wake alarms and physical light control are not available yet; keep your usual alarm. Settings apply to this visit.</p><button onClick={onRoutines}>My routines <FiArrowRight /></button></div>
    {session && <dialog ref={dialog} className={s.session} onCancel={e => { e.preventDefault(); stop(); }} style={{ "--light": frame.light, "--brightness": frame.brightness, "--sun-y": `${80 - frame.light * 65}%`, "--sky": `hsl(${18 + frame.light * 24} ${45 + frame.light * 45}% ${3 + frame.brightness * 82}%)` } as CSSProperties} aria-labelledby="light-session-title">
      <div className={s.glow} aria-hidden="true" /><div className={s.sun} aria-hidden="true" /><div className={s.horizon} aria-hidden="true" />
      <div className={s.sessionTop}><span>TEMPO · {mode === "sunrise" ? "MORNING LIGHT" : "WIND DOWN"}</span><button onClick={stop} aria-label="End light session"><FiX /></button></div>
      <div className={s.sessionContent}><h2 id="light-session-title">{finished ? mode === "sunrise" ? "Hello, new day." : "Rest comes next." : mode === "sunrise" ? "A gentler beginning." : "Nothing more to do."}</h2><div className={s.timer} aria-label={`${frame.remainingSeconds} seconds remaining`}>{Math.floor(frame.remainingSeconds / 60)}:{String(frame.remainingSeconds % 60).padStart(2, "0")}</div><progress aria-label="Light session progress" max="1" value={frame.progress} /><p role="status">{finished ? "Complete. Stay here as long as you like." : notice || wakeNotice || "Breathe. Let the light do its thing."}</p></div>
      <div className={s.sessionActions}>{sound !== "silent" && !finished && <button onClick={() => { audio.current?.mute(!muted); setMuted(!muted); }}>{muted ? <FiVolumeX /> : <FiVolume2 />}{muted ? "Unmute" : "Mute"}</button>}<button onClick={async () => { try { await dialog.current?.requestFullscreen(); } catch { setNotice("Full screen is unavailable. The light session will continue here."); } }}><FiMaximize /> Full screen</button><button onClick={stop}>{finished ? "Done" : "End session"}</button></div>
    </dialog>}
  </div>;
}
