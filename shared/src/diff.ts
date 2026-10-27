/** Minimal LCS diff over tokens (words or lines) for side-by-side comparisons. */
export type DiffPart = { type: "same" | "add" | "del"; text: string };

export function diffTokens(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 400_000) {
    // Too large for a full table; show as replaced.
    return [...a.map((t) => ({ type: "del" as const, text: t })), ...b.map((t) => ({ type: "add" as const, text: t }))];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else out.push({ type: "add", text: b[j++] });
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

export const diffWords = (a: string, b: string) => diffTokens(a.split(/(\s+)/).filter(Boolean), b.split(/(\s+)/).filter(Boolean));
export const diffLines = (a: string, b: string) => diffTokens(a.split("\n"), b.split("\n"));
