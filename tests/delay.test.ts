import IO, { OutcomeKind } from "../src/io";
import { runSafeWithTimeoutTrace } from "./utils";

describe("The delay method", () => {
  it("Returns an IO which waits for the duration before running the effect", async () => {
    const [outcome, timeoutTrace] = await runSafeWithTimeoutTrace(
      IO.wrap("result").delay(15, "milliseconds")
    );

    expect(outcome.kind === OutcomeKind.Succeeded).toBe(true);
    expect((outcome as any).value).toBe("result");
    expect(timeoutTrace).toEqual([["setTimeout", 15, expect.anything()]]);
  });
});
