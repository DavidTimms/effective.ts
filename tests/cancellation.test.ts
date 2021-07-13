import fc from "fast-check";
import { CancellationError } from "../src/errors";
import IO, { Fiber, IOOutcome, IOResult } from "../src/io";

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

describe("The IO.cancelable function", () => {
  it("creates an IO which performs the side-effect when run", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (effectResult) => {
        let effectPerformedCount = 0;
        const io = IO.cancelable(() => {
          effectPerformedCount += 1;
          return {
            promise: Promise.resolve(effectResult),
            cancel: () => {},
          };
        });
        expect(effectPerformedCount).toBe(0);
        const result = io.run();
        expect(effectPerformedCount).toBe(1);
        return expect(result).resolves.toBe(effectResult);
      })
    ));

  it("creates an IO which rejects when run if the side-effect throws", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (thrownValue) => {
        const io = IO.cancelable(() => {
          throw thrownValue;
        });
        return expect(io.run()).rejects.toBe(thrownValue);
      })
    ));

  it("creates an IO which calls the returned 'cancel' function if the fiber is externally canceled", async () => {
    let effectCalled = false;
    let cancelCalled = false;

    const fiberProgram = IO.cancelable(() => {
      effectCalled = true;
      const promise = new Promise((resolve) => setTimeout(resolve, 10));
      return {
        promise,
        cancel() {
          cancelCalled = true;
        },
      };
    });

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    await io.run();

    expect(effectCalled).toBe(true);
    expect(cancelCalled).toBe(true);
  });

  it("creates an IO which raises when canceled if the 'cancel' function throws an error", async () => {
    const fiberProgram = IO.cancelable(() => {
      const promise = new Promise((resolve) => setTimeout(resolve, 10));
      return {
        promise,
        cancel() {
          throw "error";
        },
      };
    });

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.run();

    expect(outcome).toEqual(IOResult.Raised("error"));
  });
});
