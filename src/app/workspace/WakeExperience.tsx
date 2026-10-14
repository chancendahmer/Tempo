"use client";
import { loopDialogTab } from "./dialog-keyboard";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FiArrowRight, FiCheck, FiChevronDown, FiClock, FiMaximize, FiMoon, FiPlay, FiSliders, FiSun, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
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

  return <div className={s.root} data-mode={mode}>
    <div className={s.choices} role="group" aria-label="Choose a light session">
      <button type="button" className={`${s.choice} ${s.sunrise}`} aria-pressed={mode === "sunrise"} onClick={() => setMode("sunrise")}>
        <span className={s.modeIcon} aria-hidden="true"><FiSun /></span>
        <span className={s.choiceCopy}><strong>Sunrise</strong><span>A gentle start to your day</span></span>
        <span className={s.selection} aria-hidden="true">{mode === "sunrise" && <FiCheck />}</span>
      </button>
      <button type="button" className={`${s.choice} ${s.sunset}`} aria-pressed={mode === "sunset"} onClick={() => setMode("sunset")}>
        <span className={s.modeIcon} aria-hidden="true"><FiMoon /></span>
        <span className={s.choiceCopy}><strong>Sunset</strong><span>A little space to wind down</span></span>
        <span className={s.selection} aria-hidden="true">{mode === "sunset" && <FiCheck />}</span>
      </button>
    </div>
    <section className={s.controls} aria-label="Session settings">
      <div className={s.sessionIntro}>
        <div><p className={s.eyebrow}>START WHEN YOU’RE READY</p><h2>{mode === "sunrise" ? "Let a little light in." : "Let the day settle."}</h2><p>{mode === "sunrise" ? "Watch your screen slowly brighten into a warm sunrise." : "Warm light slowly fades through amber into night."}</p></div>
        <span className={mode === "sunrise" ? s.miniSun : s.miniMoon} aria-hidden="true" />
      </div>
      <div className={s.startRow}>
        <label className={s.duration}><span><FiClock aria-hidden="true" /> Duration</span><select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[5, 10, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
        <div className={s.actions}><button type="button" className={s.start} onClick={() => start()}><FiPlay aria-hidden="true" /> Start {mode}</button><button type="button" className={s.preview} onClick={() => start(true)}>Try 20 seconds</button></div>
      </div>
      <details className={s.settings}>
        <summary><FiSliders aria-hidden="true" /><span>Sound & light<small>{sound === "silent" ? "No sound" : sound === "birds" ? "Morning birds" : "Ocean waves"} · {maximum}% light</small></span><FiChevronDown className={s.chevron} aria-hidden="true" /></summary>
        <div className={s.settingsGrid}>
          <label>Soundscape<select value={sound} onChange={e => setSound(e.target.value as Soundscape)}><option value="silent">Quiet · no sound</option><option value="waves">Ocean waves · synthesized</option><option value="birds">Morning birds · synthesized</option></select></label>
          <label>Maximum screen glow <span>{maximum}%</span><input type="range" min="10" max="100" step="5" value={maximum} aria-valuetext={`${maximum}% screen glow`} onChange={e => setMaximum(Number(e.target.value))} /><small>Changes the colors on screen, not device brightness.</small></label>
        </div>
      </details>
    </section>
    <div className={s.note}><FiClock aria-hidden="true" /><div><strong>A session for right now</strong><p>Keep this screen open and your device awake. Scheduled alarms aren’t available yet, so keep your usual alarm.</p><details><summary>About screen light & sound</summary><p>Settings apply to this visit. Sound starts only when you start a session. Tempo changes screen colors; it cannot control your device’s physical brightness or wake it from sleep.</p></details></div><button type="button" onClick={onRoutines}>My routines <FiArrowRight aria-hidden="true" /></button></div>
    {session && <dialog onKeyDown={loopDialogTab} ref={dialog} className={s.session} onCancel={e => { e.preventDefault(); stop(); }} style={{ "--light": frame.light, "--brightness": frame.brightness, "--sun-y": `${80 - frame.light * 65}%`, "--sky": `hsl(${18 + frame.light * 24} ${45 + frame.light * 45}% ${3 + frame.brightness * 82}%)` } as CSSProperties} aria-labelledby="light-session-title">
      <div className={s.glow} aria-hidden="true" /><div className={s.sun} aria-hidden="true" /><div className={s.horizon} aria-hidden="true" />
      <div className={s.sessionTop}><span>TEMPO · {mode === "sunrise" ? "MORNING LIGHT" : "WIND DOWN"}</span><button onClick={stop} aria-label="End light session"><FiX /></button></div>
      <div className={s.sessionContent}><h2 id="light-session-title">{finished ? mode === "sunrise" ? "Hello, new day." : "Rest comes next." : mode === "sunrise" ? "A gentler beginning." : "Nothing more to do."}</h2><div className={s.timer} aria-label={`${frame.remainingSeconds} seconds remaining`}>{Math.floor(frame.remainingSeconds / 60)}:{String(frame.remainingSeconds % 60).padStart(2, "0")}</div><progress aria-label="Light session progress" max="1" value={frame.progress} /><p role="status">{finished ? "Complete. Stay here as long as you like." : notice || wakeNotice || "Breathe. Let the light do its thing."}</p></div>
      <div className={s.sessionActions}>{sound !== "silent" && !finished && <button onClick={() => { audio.current?.mute(!muted); setMuted(!muted); }}>{muted ? <FiVolumeX /> : <FiVolume2 />}{muted ? "Unmute" : "Mute"}</button>}<button onClick={async () => { try { await dialog.current?.requestFullscreen(); } catch { setNotice("Full screen is unavailable. The light session will continue here."); } }}><FiMaximize /> Full screen</button><button onClick={stop}>{finished ? "Done" : "End session"}</button></div>
    </dialog>}
  </div>;
}
