import "server-only";

import { randomInt } from "node:crypto";

// Ambiguous glyphs (0/O, 1/I/l) are omitted: these credentials are copied by
// hand from an admin's screen (email delivery is deferred, KI-003).
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;
const LENGTH = 16;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/**
 * 16 characters (~93 bits) with at least one upper/lower/digit. Guaranteed
 * classes are shuffled so their positions do not leak. Callers must treat the
 * result as a one-time secret (D-020): show once, never store or log.
 */
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < LENGTH) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
