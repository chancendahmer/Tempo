/** These messages never authorize a state-changing command. */
export function isConversationOnlyMessage(message: string): boolean {
  const text = message.trim();
  return /^(?:hello|hi|hey|hey tempo|hello tempo)[!.\s]*$/i.test(text)
    || /^(?:(?:who are you|what can you do|can you help me(?: with anything)?)[?.!\s]*)+$/i.test(text)
    || /^(?:that[’']?s not what i (?:said|asked)(?: to do)?|that is not what i (?:said|asked)(?: to do)?|you got (?:that|it) wrong)[!.\s]*$/i.test(text);
}
