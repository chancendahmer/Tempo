export type WorkoutExercise = { name: string; dose: string; alternative?: string };
export type WorkoutSession = { name: string; minutes: number; exercises: WorkoutExercise[] };
export type WorkoutProgram = { id: string; title: string; cadence: string; equipment: string; experience: string; rest: string; description: string; guidance: string; sessions: WorkoutSession[] };

export const workoutSources = [
  { title: "CDC: activity and strength basics", url: "https://www.cdc.gov/physical-activity-basics/adding-adults/what-counts.html" },
  { title: "NHS: home strength movements", url: "https://www.nhs.uk/live-well/exercise/strength-exercises/" },
  { title: "NHS: strength and flexibility demonstrations", url: "https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/" },
];
const move = (name: string, dose: string, alternative: string): WorkoutExercise => ({ name, dose, alternative });

// General, editable examples — not individualized training prescriptions.
export const workoutPrograms: WorkoutProgram[] = [
  { id: "full-body", title: "Full-body foundations", cadence: "2 days / week", equipment: "Dumbbells + bench", experience: "New or returning", rest: "60–90 seconds, or longer as needed", description: "Two short sessions. A day to recover between them.", guidance: "Start with light weights and controlled movement. Warm up for 5 minutes. Rest 60–90 seconds between sets, or longer as needed. Leave a few comfortable repetitions in reserve.", sessions: [
    { name: "Session A", minutes: 35, exercises: [{ name: "Goblet squat to a bench", dose: "2 sets × 8–10 reps" }, { name: "Dumbbell floor press", dose: "2 × 8–10" }, { name: "Supported dumbbell row", dose: "2 × 8–10 each side" }, { name: "Glute bridge", dose: "2 × 10–12" }, { name: "Dead bug", dose: "2 × 6 each side" }] },
    { name: "Session B", minutes: 35, exercises: [{ name: "Dumbbell Romanian deadlift", dose: "2 × 8–10" }, { name: "Low step-up", dose: "2 × 8 each side" }, { name: "Incline push-up on a stable bench", dose: "2 × 6–10" }, { name: "Supported dumbbell row", dose: "2 × 8–10 each side" }, { name: "Standing dumbbell shoulder press", dose: "2 × 8–10" }] },
  ] },
  { id: "upper-lower", title: "Upper / lower balance", cadence: "2–4 days / week", equipment: "Dumbbells + gym", experience: "Some lifting experience", rest: "90 seconds, or longer as needed", description: "Alternate upper and lower days around your week.", guidance: "Start with one upper and one lower day. Add sessions when they fit your recovery and experience. Practice familiar movements with manageable weights.", sessions: [
    { name: "Upper", minutes: 40, exercises: [move("Dumbbell bench press", "2 × 8–12", "Dumbbell floor press"), move("Seated cable row", "2 × 8–12", "Supported dumbbell row"), move("Seated dumbbell shoulder press", "2 × 8–12", "Machine shoulder press"), move("Lat pulldown", "2 × 8–12", "Assisted pull-up"), move("Dumbbell curl", "2 × 8–12", "Cable curl")] },
    { name: "Lower", minutes: 40, exercises: [move("Goblet squat", "2 × 8–12", "Sit-to-stand from a chair"), move("Dumbbell Romanian deadlift", "2 × 8–12", "Glute bridge"), move("Supported split squat", "2 × 8 each side", "Low step-up"), move("Standing calf raise", "2 × 8–12", "Seated calf raise"), move("Dead bug", "2 × 6 each side", "Standing march")] },
  ] },
  { id: "push-pull-legs", title: "Push / pull / legs", cadence: "3 days / week", equipment: "Gym equipment", experience: "Confident with gym basics", rest: "90–120 seconds, or longer as needed", description: "A familiar split for people already comfortable in the gym.", guidance: "Example spacing: Monday, Wednesday, Friday. Warm up first, including light practice sets. Rest 90–120 seconds between working sets. Use familiar movements and a load you can control; this is not a max-effort plan.", sessions: [
    { name: "Push", minutes: 40, exercises: [{ name: "Dumbbell bench press", dose: "3 × 8–10" }, { name: "Seated dumbbell shoulder press", dose: "2 × 8–10" }, { name: "Dumbbell lateral raise", dose: "2 × 10–12" }, { name: "Cable triceps pressdown", dose: "2 × 10–12" }] },
    { name: "Pull", minutes: 40, exercises: [{ name: "Lat pulldown", dose: "3 × 8–10" }, { name: "Seated cable row", dose: "3 × 8–10" }, { name: "Cable face pull", dose: "2 × 10–12" }, { name: "Dumbbell curl", dose: "2 × 10–12" }] },
    { name: "Legs", minutes: 45, exercises: [{ name: "Goblet squat", dose: "3 × 8–10" }, { name: "Dumbbell Romanian deadlift", dose: "3 × 8–10" }, { name: "Seated leg curl", dose: "2 × 10–12" }, { name: "Standing calf raise", dose: "2 × 10–15" }] },
  ] },
  { id: "calisthenics", title: "Bodyweight practice", cadence: "2 days / week", equipment: "Mat + secure low bar", experience: "Comfortable with bodyweight basics", rest: "60–90 seconds, or longer as needed", description: "Build a repeatable practice using your bodyweight.", guidance: "Choose a version of each movement you can control. Use equipment designed to bear your weight. Take a day between sessions.", sessions: [
    { name: "Bodyweight circuit", minutes: 30, exercises: [move("Incline push-up on a stable bench", "2 × 6–10", "Wall push-up"), move("Bodyweight squat", "2 × 8–12", "Sit-to-stand from a chair"), move("Bodyweight row on a secure low bar", "2 × 6–10", "Supported dumbbell row"), move("Glute bridge", "2 × 8–12", "Standing hip extension"), move("Knee plank", "2 × 15–20 seconds", "Dead bug")] },
  ] },
  { id: "at-home", title: "A little movement at home", cadence: "2 days / week", equipment: "Stable chair + wall", experience: "A gentle starting point", rest: "As much as you need", description: "A small starting point when getting to the gym feels like too much.", guidance: "Leave a day between sessions. Begin with an easy walk around the room. Rest as needed; one set is a useful start. Use a stable chair against a wall and work in a comfortable range.", sessions: [
    { name: "Home circuit", minutes: 15, exercises: [{ name: "Sit-to-stand from a chair", dose: "1–2 × 6–10" }, { name: "Wall push-up", dose: "1–2 × 6–10" }, { name: "Standing calf raise with support", dose: "1–2 × 8–12" }, { name: "Standing march", dose: "2 × 30 seconds" }] },
  ] },
  { id: "walking-mobility", title: "Walk & unwind", cadence: "Choose days that fit", equipment: "Comfortable shoes + space", experience: "Start at your own pace", rest: "Pause whenever you need", description: "A little fresh air, then a comfortable stretch.", guidance: "Pick a manageable route and pace. Short bouts of activity count. Adjust the time to suit your day; this is a starter session, not a weekly activity target.", sessions: [
    { name: "Walk & mobility", minutes: 20, exercises: [move("Easy-paced walk", "3 minutes", "Comfortable indoor walk"), move("Walk at your chosen pace", "12 minutes", "Shorter walking intervals with breaks"), move("Slow walk to finish", "3 minutes", "Easy standing march"), move("Comfortable shoulder and ankle movements", "2 minutes", "Seated shoulder and ankle movements")] },
  ] },
];

export function workoutTaskDraft(program: { title: string }, session: WorkoutSession) {
  const sessionName = session.name.slice(0, 120);
  return { title: `${program.title.slice(0, 237 - sessionName.length)} · ${sessionName}`, estimatedMinutes: session.minutes };
}

const alternatives: Record<string, string> = {
  "Goblet squat to a bench": "Sit-to-stand from a chair", "Dumbbell floor press": "Wall push-up", "Supported dumbbell row": "Seated cable row", "Glute bridge": "Standing hip extension", "Dead bug": "Standing march", "Dumbbell Romanian deadlift": "Glute bridge", "Low step-up": "Sit-to-stand from a chair", "Incline push-up on a stable bench": "Wall push-up", "Standing dumbbell shoulder press": "Seated dumbbell shoulder press", "Dumbbell bench press": "Machine chest press", "Seated dumbbell shoulder press": "Machine shoulder press", "Dumbbell lateral raise": "Cable lateral raise", "Cable triceps pressdown": "Light dumbbell triceps extension", "Lat pulldown": "Assisted pull-up", "Seated cable row": "Supported dumbbell row", "Cable face pull": "Light reverse fly", "Dumbbell curl": "Cable curl", "Goblet squat": "Sit-to-stand from a chair", "Seated leg curl": "Lying leg curl", "Standing calf raise": "Seated calf raise", "Sit-to-stand from a chair": "Supported mini-squat", "Wall push-up": "A smaller-range wall push-up", "Standing calf raise with support": "Seated calf raise", "Standing march": "Seated march",
};
export function exerciseAlternative(exercise: WorkoutExercise) { return exercise.alternative ?? alternatives[exercise.name]; }
