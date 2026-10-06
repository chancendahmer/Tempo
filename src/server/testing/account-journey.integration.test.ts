import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { mutateWorkspace } from "../db/repositories/workspace-repository";
import type { TaskIntentParser } from "../adapters/llm/task-intent-parser";
import type { SavedLifeItem } from "../domain/life-items";

it("twenty accounts keep SMS, dashboard edits, assistant context and replies separate (scripted parser)", async () => {
  const observations: Parameters<TaskIntentParser["parse"]>[0][] = [];
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async input => input.message.startsWith("Remember that my preferred project name is ") ? { mode: "write", commands: ["remember_memory"] } : { mode: "read_only", commands: [] } },
    parse: async input => {
    observations.push(input);
    const { items: notes } = JSON.parse(await input.execute!({ type: "life_list", kind: "note" })) as { items: SavedLifeItem[] };
    return { kind: "conversation", reply: `[SCRIPTED] ${notes.map(note => note.data.title).join(", ")}` };
  } });
  try {
    const people: Awaited<ReturnType<typeof simulation.user>>[] = [];
    for (let index = 0; index < 20; index++) people.push(await simulation.user());
    // Settle all concurrent operations before closing the single WASM database,
    // including when one assertion fails; closing during queued writes can hang.
    const results = await Promise.allSettled(people.map(async (person, index) => {
      const marker = `PRIVATE_ACCOUNT_${index}_ONLY`;
      await person.send(`Remember that my preferred project name is ${marker}`);
      await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: marker, body: "Created in dashboard" } }, simulation.database);
      await person.send(`Show my notes for ${marker}`, { channel: "web" });
      const sms = await person.send(`What notes did we just discuss for ${marker}?`);
      expect(sms.replies).toEqual([`[SCRIPTED] ${marker}`]);
      const workspace = await person.workspace();
      expect(workspace.items.map(item => item.data.title)).toEqual([marker]);
      expect(workspace.messages.some(row => row.body === sms.input)).toBe(true);
      const contexts = observations.filter(input => input.message.includes(marker));
      expect(contexts).toHaveLength(2);
      expect(contexts[1].history?.some(row => row.content === `[SCRIPTED] ${marker}`)).toBe(true);
      expect(contexts[1].memories.join(" ")).toContain(marker);
      for (const otherIndex of people.keys()) {
        if (otherIndex === index) continue;
        const foreign = `PRIVATE_ACCOUNT_${otherIndex}_ONLY`;
        expect(JSON.stringify(contexts)).not.toContain(foreign);
        expect(JSON.stringify(workspace)).not.toContain(foreign);
      }
    }));
    for (const result of results) if (result.status === "rejected") throw result.reason;
    // Web conversations were captured in shared history, never sent to a carrier.
    expect(simulation.transport.sent).toHaveLength(40);
  } finally { await simulation.close(); }
}, 60000);

it("isolates concurrent task commits, web task lookups and account rundowns for twenty users (scripted parser)", async () => {
  const taskLookupContexts: Parameters<TaskIntentParser["parse"]>[0][] = [];
  const simulation = await createAssistantSimulator({ parse: async input => {
    if (input.message === "Which task should I focus on?") {
      taskLookupContexts.push(input);
      return { kind: "conversation", reply: `[SCRIPTED TASK CONTEXT] ${input.openTasks.map(task => task.title).join(", ")}` };
    }
    return { kind: "conversation", reply: `[SCRIPTED CONTEXT] ${input.openTasks.map(task => task.title).join(", ")}` };
  } });
  try {
    simulation.setTime(new Date("2027-01-14T15:00:00Z"));
    const people: Awaited<ReturnType<typeof simulation.user>>[] = [];
    for (let index = 0; index < 20; index++) people.push(await simulation.user());
    const titles = people.map((_, index) => `ACCOUNT_${String(index).padStart(2, "0")}_PRIVATE_TASK`);

    // Commit distinct dashboard task writes at the same time, then issue reads
    // and deterministic account-scoped rundowns concurrently across all users.
    const writes = await Promise.all(people.map((person, index) => mutateWorkspace(person.id, {
      action: "task",
      requestId: randomUUID(),
      command: { type: "create_task", title: titles[index], dueAt: "2027-01-15T12:00:00-05:00" },
    }, simulation.database)));
    expect(writes.map(write => write.message)).toEqual(titles.map(title => `Added: ${title}.`));

    const lookups = await Promise.all(people.map(person => person.send("Which task should I focus on?", { channel: "web" })));
    const rundowns = await Promise.all(people.map(person => person.send("Weekly rundown for 2027-01-11", { channel: "web" })));
    const workspaces = await Promise.all(people.map(person => person.workspace()));

    for (const index of people.keys()) {
      const own = titles[index];
      const foreignTitles = titles.filter((_, foreignIndex) => foreignIndex !== index);
      expect(lookups[index].replies).toEqual([`[SCRIPTED TASK CONTEXT] ${own}`]);
      expect(rundowns[index].replies[0]).toContain(own);
      expect(workspaces[index].tasks.map(task => task.title)).toEqual([own]);
      expect(workspaces[index].messages.some(message => message.body === "Which task should I focus on?")).toBe(true);
      for (const foreign of foreignTitles) {
        expect(lookups[index].replies[0]).not.toContain(foreign);
        expect(rundowns[index].replies[0]).not.toContain(foreign);
        expect(JSON.stringify(workspaces[index])).not.toContain(foreign);
      }
    }
    expect(taskLookupContexts).toHaveLength(20);
    for (const context of taskLookupContexts) {
      const own = context.openTasks[0]?.title;
      expect(titles).toContain(own);
      expect(context.openTasks.map(task => task.title)).toEqual([own]);
      for (const foreign of titles.filter(title => title !== own)) {
        expect(JSON.stringify(context)).not.toContain(foreign);
      }
    }
    // Web replies remain in each account's history and are never sent over SMS.
    expect(simulation.transport.sent).toHaveLength(0);
  } finally { await simulation.close(); }
}, 60000);

it("SMS recipe -> web follow-up edit -> dashboard edit -> SMS recall and delete share one record", async () => {
  const recipe = { kind: "recipe" as const, title: "Lemon rice", ingredients: "Rice\nLemon", instructions: "Cook rice and add lemon.", servings: 2, prepMinutes: 20, favorite: true };
  const simulation = await createAssistantSimulator({ parse: async input => {
    if (input.message.startsWith("Save")) return { kind: "command", command: { type: "life_save", data: recipe } };
    const { items: rows } = JSON.parse(await input.execute!({ type: "life_list", kind: "recipe" })) as { items: SavedLifeItem[] };
    const row = rows[0];
    if (input.message.startsWith("Make")) return { kind: "command", command: { type: "life_patch", id: row.id, version: row.version, patch: { kind: "recipe", servings: 4 } } };
    if (input.message.startsWith("Delete")) return { kind: "command", command: { type: "life_remove", id: row.id, version: row.version } };
    return { kind: "conversation", reply: JSON.stringify(rows) };
  } });
  try {
    const user = await simulation.user(), other = await simulation.user();
    await user.send("Save my lemon rice recipe: rice, lemon, cook rice and add lemon. Serves 2, 20 minutes.");
    const first = (await user.workspace()).items[0];
    const edit = await user.send("Make that recipe serve four instead.", { channel: "web" });
    expect(edit.replies).toEqual(["Updated: Lemon rice. Serves 4."]);
    expect((await user.workspace()).items).toEqual([{ ...first, version: 2, data: { ...recipe, servings: 4 } }]);
    const replay = await user.send(edit.input, { channel: "web", providerId: edit.providerId });
    expect(replay).toMatchObject({ duplicate: true, replies: [] });
    await mutateWorkspace(user.id, { action: "save", id: first.id, version: 2, data: { ...recipe, servings: 4, prepMinutes: 30 } }, simulation.database);
    expect((await user.send("Show my recipes")).replies.join()).toContain('"prepMinutes":30');
    await expect(mutateWorkspace(other.id, { action: "delete", id: first.id, version: 3 }, simulation.database)).rejects.toThrow();
    expect((await other.workspace()).items).toHaveLength(0);
    await user.send("Delete my lemon rice recipe", { channel: "web" });
    expect((await user.workspace()).items).toHaveLength(0);
    expect((await user.state()).tasks).toHaveLength(0);
  } finally { await simulation.close(); }
}, 30000);
