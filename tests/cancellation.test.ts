import { CancellationError } from "../src/errors";
import IO, { IOOutcome } from "../src/io";

describe("The IO.cancel function", () => {
  it("gives an IO which results in the 'canceled' outcome", async () => {
    const result = await IO.cancel().runSafe();
    expect(result).toEqual({ outcome: IOOutcome.Canceled });
  });

  it("gives an IO which throws a CancellationError if run directly", async () => {
    expect(IO.cancel().run()).rejects.toEqual(new CancellationError());
  });

  it("prevents any subsequent actions from being run", async () => {
    let subsequentEffectHasRun = false;
    const io = IO.cancel().andThen(() =>
      IO(() => (subsequentEffectHasRun = true))
    );
    await io.runSafe();
    expect(subsequentEffectHasRun).toBe(false);
  });
});
