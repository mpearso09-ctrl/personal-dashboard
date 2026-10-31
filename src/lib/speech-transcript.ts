export type SpeechPiece = { isFinal: boolean; transcript: string };

/**
 * One Web Speech session. iOS sends the whole result list on every event,
 * so this rebuilds the session instead of appending a slice of new indexes.
 * Words still marked interim are kept: Safari often ends the session before
 * the last phrase is marked final.
 */
export function readSpeechResults(results: ArrayLike<SpeechPiece> | SpeechPiece[]): {
  finalText: string;
  interim: string;
} {
  let finalText = '';
  let interim = '';
  const list = Array.from(results);
  for (const result of list) {
    const text = result.transcript ?? '';
    if (result.isFinal) finalText += text;
    else interim += text;
  }
  return { finalText: squash(finalText), interim: squash(interim) };
}

/** Join phrases from separate recognition sessions without dropping a half-finished one. */
export function commitTranscript(committed: string, sessionFinal: string, sessionInterim: string): string {
  return squash([committed, sessionFinal, sessionInterim].filter(Boolean).join(' '));
}

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
