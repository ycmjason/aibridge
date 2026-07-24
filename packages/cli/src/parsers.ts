/**
 * stricli `parse` functions (string -> T). Throwing inside one makes stricli
 * reject the argument up-front with a clean, flag-named error — instead of
 * silently letting a bad value (NaN, Infinity, "") flow into an impl where it
 * gets masked or, worse, breaks `setTimeout`.
 */

export function positiveIntSeconds(input: string): number {
  const n = Number(input);
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`expected a positive whole number of seconds, got "${input}"`);
  }
  if (n > 86_400) {
    throw new RangeError(`timeout too large: ${n}s (max 86400 = 24h)`);
  }
  return n;
}

export function nonEmptyPrompt(input: string): string {
  if (input.trim().length === 0) {
    throw new Error('prompt must not be empty');
  }
  return input;
}
