export function range(n: number): number[] {
  return Array(n)
    .fill(null)
    .map((_, i) => i);
}
