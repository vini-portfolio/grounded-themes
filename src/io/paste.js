// Turns pasted text into notes: one note per non-empty line.

/**
 * @param {string} text
 * @returns {{ id: string, text: string }[]}
 */
export function parsePastedNotes(text) {
  return String(text)
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => ({ id: `n${i + 1}`, text: line }));
}
