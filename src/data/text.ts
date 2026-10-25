/** Words race control writes in capitals that should stay that way. */
const KEEP = new Set(["FIA", "VSC", "SC", "DRS", "DNF", "DNS", "DSQ", "PU", "ERS", "TV", "OK", "II", "III", "FP1", "FP2", "FP3", "Q1", "Q2", "Q3", "SQ1", "SQ2", "SQ3", "UTC", "GMT"]);

/**
 * Sentence case for all-caps race control text. Keeps driver codes in brackets, sector and
 * turn ids, lap times and known abbreviations. Text that is not all caps is returned as is.
 */
export function sentenceCase(msg: string): string {
  if (!msg || /[a-z]/.test(msg)) return msg;
  let first = true;
  return msg.replace(/\(?[A-Z0-9][A-Z0-9'.:/-]*\)?/g, (w) => {
    const bare = w.replace(/[()]/g, "");
    let out: string;
    if (/^\(.+\)$/.test(w) || KEEP.has(bare) || /\d/.test(bare) || bare.length === 1 && bare !== "A") out = w;
    else out = w.toLowerCase();
    if (first) {
      out = out.charAt(0).toUpperCase() + out.slice(1);
      first = false;
    }
    return out;
  }).replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
