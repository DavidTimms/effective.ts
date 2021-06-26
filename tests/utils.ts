import IO, { IOResult } from "../src/io";

export function range(n: number): number[] {
  return Array(n)
    .fill(null)
    .map((_, i) => i);
}

type TimeoutFunctionName = "setTimeout" | "clearTimeout" | "setInterval";
type TimeoutTrace = Array<
  [
    function: TimeoutFunctionName,
    milliseconds: number,
    id: NodeJS.Timeout | number
  ]
>;

export async function runSafeWithTimeoutTrace<A, E>(
  io: IO<A, E>
): Promise<[IOResult<A, E>, TimeoutTrace]> {
  const trace: TimeoutTrace = [];
  const originalSetTimeout = IO._setTimeout;
  try {
    IO._setTimeout = ((callback: () => unknown, milliseconds: number) => {
      const id = setTimeout(callback, 0);
      trace.push(["setTimeout", milliseconds, id]);
    }) as typeof IO._setTimeout;

    return [await io.runSafe(), trace];
  } finally {
    IO._setTimeout = originalSetTimeout;
  }
}
