export type WorkoutSession = { name: string; minutes: number; exercises: { name: string; dose: string }[] };
export type WorkoutProgram = { id: string; title: string; cadence: string; equipment: string; description: string; guidance: string; sessions: WorkoutSession[] };

// General, editable examples — not individualized training prescriptions.
export const workoutPrograms: WorkoutProgram[] = [
  { id: "full-body", title: "Full-body foundations", cadence: "2 days / week", equipment: "Dumbbells + bench", description: "Two short sessions. A day to recover between them.", guidance: "Start with light weights and controlled movement. Warm up for 5 minutes. Rest 60–90 seconds between sets, or longer as needed. Leave a few comfortable repetitions in reserve.", sessions: [
    { name: "Session A", minutes: 35, exercises: [{ name: "Goblet squat to a bench", dose: "2 sets × 8–10 reps" }, { name: "Dumbbell floor press", dose: "2 × 8–10" }, { name: "Supported dumbbell row", dose: "2 × 8–10 each side" }, { name: "Glute bridge", dose: "2 × 10–12" }, { name: "Dead bug", dose: "2 × 6 each side" }] },
    { name: "Session B", minutes: 35, exercises: [{ name: "Dumbbell Romanian deadlift", dose: "2 × 8–10" }, { name: "Low step-up", dose: "2 × 8 each side" }, { name: "Incline push-up on a stable bench", dose: "2 × 6–10" }, { name: "Supported dumbbell row", dose: "2 × 8–10 each side" }, { name: "Standing dumbbell shoulder press", dose: "2 × 8–10" }] },
  ] },
  { id: "push-pull-legs", title: "Push / pull / legs", cadence: "3 days / week", equipment: "Gym equipment", description: "A familiar split for people already comfortable in the gym.", guidance: "Example spacing: Monday, Wednesday, Friday. Warm up first, including light practice sets. Rest 90–120 seconds between working sets. Use familiar movements and a load you can control; this is not a max-effort plan.", sessions: [
    { name: "Push", minutes: 40, exercises: [{ name: "Dumbbell bench press", dose: "3 × 8–10" }, { name: "Seated dumbbell shoulder press", dose: "2 × 8–10" }, { name: "Dumbbell lateral raise", dose: "2 × 10–12" }, { name: "Cable triceps pressdown", dose: "2 × 10–12" }] },
    { name: "Pull", minutes: 40, exercises: [{ name: "Lat pulldown", dose: "3 × 8–10" }, { name: "Seated cable row", dose: "3 × 8–10" }, { name: "Cable face pull", dose: "2 × 10–12" }, { name: "Dumbbell curl", dose: "2 × 10–12" }] },
    { name: "Legs", minutes: 45, exercises: [{ name: "Goblet squat", dose: "3 × 8–10" }, { name: "Dumbbell Romanian deadlift", dose: "3 × 8–10" }, { name: "Seated leg curl", dose: "2 × 10–12" }, { name: "Standing calf raise", dose: "2 × 10–15" }] },
  ] },
  { id: "at-home", title: "A little movement at home", cadence: "2 days / week", equipment: "Stable chair + wall", description: "A small starting point when getting to the gym feels like too much.", guidance: "Leave a day between sessions. Begin with an easy walk around the room. Rest as needed; one set is a useful start. Use a stable chair against a wall and work in a comfortable range.", sessions: [
    { name: "Home circuit", minutes: 15, exercises: [{ name: "Sit-to-stand from a chair", dose: "1–2 × 6–10" }, { name: "Wall push-up", dose: "1–2 × 6–10" }, { name: "Standing calf raise with support", dose: "1–2 × 8–12" }, { name: "Standing march", dose: "2 × 30 seconds" }] },
  ] },
];

export function workoutTaskDraft(program: WorkoutProgram, session: WorkoutSession) {
  return { title: `${program.title} · ${session.name}`, estimatedMinutes: session.minutes };
}
