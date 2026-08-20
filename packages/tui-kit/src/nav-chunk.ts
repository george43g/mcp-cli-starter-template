/**
 * Split a keystroke chunk into single characters — but only when every
 * character is one you own.
 *
 * Ink delivers a paste, or a fast burst, as ONE `useInput` call carrying the
 * whole string. A router that fans every chunk out per character lets a paste
 * drive motion and reach destructive keys; one that never fans out breaks
 * legitimate fast repeats like `jjjj`.
 *
 * ALL-OR-NOTHING is the safety property. A partial split — fanning out the
 * characters you recognise and dropping the rest — is the paste-drives-motion
 * bug wearing a disguise, so a chunk containing anything outside `owned`
 * returns null and the caller passes it through whole.
 *
 * This is the pure half of EQStack's chunked-keystroke law. The stateful half
 * (which modes are active, what each key means) stays with the consumer; this
 * function knows nothing about modes and cannot quit anyone's app.
 */
export function splitNavChunk(input: string, owned: ReadonlySet<string>): string[] | null {
  // Code points, not UTF-16 units: a surrogate pair must be one element or the
  // halves get compared against `owned` separately and both fail confusingly.
  const chars = Array.from(input);
  for (const ch of chars) {
    if (!owned.has(ch)) return null;
  }
  return chars;
}
