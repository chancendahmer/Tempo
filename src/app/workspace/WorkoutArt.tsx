import s from "./food-fitness.module.css";

/** Local decorative artwork; the adjacent title always identifies the template. */
export function WorkoutArt({ kind }: { kind: string }) {
  return <svg viewBox="0 0 300 140" className={s.programArt} aria-hidden="true" focusable="false">
    <circle cx="238" cy="27" r="50" fill="currentColor" opacity=".06" /><circle cx="55" cy="129" r="61" fill="currentColor" opacity=".06" />
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {kind === "full-body" && <><path d="m78 85 75-35M148 94l64-30" strokeWidth="9" /><path d="m68 65 17 37m-5-42 17 37m45-61 17 37m-6-42 17 37M137 78l14 32m-4-37 14 32m40-57 14 32m-4-37 14 32" strokeWidth="12" /></>}
      {kind === "upper-lower" && <><rect x="58" y="53" width="77" height="12" rx="6" /><path d="M68 65v45m56-45v45m-66 0h76M178 36v73m-15 0h45M161 47h42m-35-11v22m27-22v22M161 76h42m-35-11v22m27-22v22" /><circle cx="97" cy="32" r="13" /></>}
      {kind === "push-pull-legs" && <><path d="M90 110V31h121v79M78 110h25m96 0h25M151 31v50m-18 0h36M178 38v63m-10-41h20m-20 12h20m-20 12h20M122 39l-16 26" /><circle cx="151" cy="32" r="8" fill="currentColor" /></>}
      {kind === "calisthenics" && <><path d="M75 113V27h151v86M66 113h18m133 0h18M124 29v28m51-28v28m-51 0 26 15 25-15M150 72v23m0 0-24 22m24-22 24 22" /><circle cx="150" cy="48" r="10" /></>}
      {kind === "at-home" && <><path d="M68 112V70h71v42M80 70V33h51v37m-42-25h31m-42 37h53M181 37v74m0 0h43" /><rect x="170" y="103" width="68" height="11" rx="5" /><path d="m191 68 15-14 15 14m-15-14v33" /></>}
      {kind === "walking-mobility" && <><path d="M68 113c21-13 53-2 76-16s-5-23 19-35 42-8 66-24M65 76V38m-12 16 12-19 13 19m119 52V78m-11 10 11-14 11 14" /><path d="m111 71 19-16 14 7m-14-7 9-21m-3 17 22-4m-20 18 3 17m-14-16-14 15" /><circle cx="146" cy="27" r="7" /><circle cx="214" cy="24" r="10" strokeWidth="2" /></>}
    </g>
    <path d="M49 122h201" stroke="currentColor" strokeWidth="2" opacity=".2" />
  </svg>;
}
