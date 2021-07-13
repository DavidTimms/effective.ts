import IO, { IOOutcome } from "../src/io";
import { runSafeWithTimeoutTrace } from "./utils";

describe("The delay method", () => {
  it("Returns an IO which waits for the duration before running the effect", async () => {
    const [result, timeoutTrace] = await runSafeWithTimeoutTrace(
      IO.wrap("result").delay(15, "milliseconds")
    );

    expect(result.outcome === IOOutcome.Succeeded).toBe(true);
    expect((result as any).value).toBe("result");
    expect(timeoutTrace).toEqual([["setTimeout", 15, expect.anything()]]);
  });
});
