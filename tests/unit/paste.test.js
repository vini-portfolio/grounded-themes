import { describe, expect, it } from 'vitest';
import { parsePastedNotes } from '../../src/io/paste.js';

describe('pasted notes', () => {
  it('makes one note per non-empty line', () => {
    const text = ['a', 'b', '', 'c', 'd', '   ', 'e', 'f', 'g', 'h'].join('\n');
    const notes = parsePastedNotes(text);
    expect(notes).toHaveLength(8);
    expect(notes.map((n) => n.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(notes[0].id).toBe('n1');
  });

  it('handles Windows and old Mac line endings and trims whitespace', () => {
    expect(parsePastedNotes('  one \r\ntwo\rthree').map((n) => n.text)).toEqual(['one', 'two', 'three']);
  });

  it('keeps markup as plain text', () => {
    expect(parsePastedNotes('<script>alert(1)</script>')[0].text).toBe('<script>alert(1)</script>');
  });
});
