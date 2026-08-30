export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required app setting: ${name}`);
  return value;
}

/**
 * Like requiredEnv, but for values that end up in an HTTP header (which must
 * be plain ASCII/Latin1). Copy-pasting a token through an app with
 * autocorrect/"smart" punctuation (Word, Notes, etc.) can silently swap in a
 * curly quote or an arrow -- the raw fetch() error for that ("character ...
 * has a value ... greater than 255") gives no hint it's an app setting
 * problem, so check explicitly and say so.
 */
export function requiredHeaderSafeEnv(name: string): string {
  const value = requiredEnv(name).trim();
  const badChar = [...value].find((c) => (c.codePointAt(0) ?? 0) > 255);
  if (badChar) {
    throw new Error(
      `App setting ${name} contains a non-standard character (U+${(badChar.codePointAt(0) ?? 0)
        .toString(16)
        .toUpperCase()}) -- it was likely copy-pasted through something with autocorrect/` +
        `"smart" punctuation enabled. Re-copy it directly from GitHub and re-save the app setting.`,
    );
  }
  return value;
}
