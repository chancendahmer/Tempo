/** These messages never authorize a state-changing command. */
export function isConversationOnlyMessage(message: string): boolean {
  const text = message.trim();
  return /^(?:hello|hi|hey|hey tempo|hello tempo)[!.\s]*$/i.test(text)
    || /^(?:(?:who are you|what can you do|can you help me(?: with anything)?)[?.!\s]*)+$/i.test(text)
    || /^(?:that[’']?s not what i (?:said|asked)(?: to do)?|that is not what i (?:said|asked)(?: to do)?|you got (?:that|it) wrong)[!.\s]*$/i.test(text);
}

/** Structured life records must not be swallowed by generic memory/task shortcuts. */
export function isLifeWorkspaceRequest(message: string): boolean {
  return /\b(recipes?|nutrition|shopping list|meal\s*(?:plan|prep)|(?:this|that|favorite|favourite) meal|routines?|food (?:log|diary)|calories|nutrients?|workouts?|grocer(?:y|ies)|notes?|thought inbox|barcode)\b/i.test(message);
}
