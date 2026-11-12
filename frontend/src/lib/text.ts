// The model cites sources as [S1] or 【S1】 (also [S1, S2]). The Sources dropdown shows
// them, so the markers are hidden in the answer text. The raw text is kept in state.
const MARKER = /\s*[[【]\s*S\d+(?:\s*[,;，、]\s*S\d+)*\s*[\]】]/g;

// While streaming, a marker may be half-received ("[", "[S", "[S1,"): hide it until complete.
const PARTIAL_TAIL = /\s*[[【]\s*(?:S\d*(?:\s*[,;，、]\s*(?:S\d*)?)*)?\s*$/;

export function stripCitations(text: string, streaming = false): string {
  let out = text.replace(MARKER, "");
  if (streaming) out = out.replace(PARTIAL_TAIL, "");
  return out;
}
