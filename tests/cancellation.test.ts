import fc from "fast-check";
import { CancellationError } from "../src/errors";
import IO, { Fiber, OutcomeKind, Outcome } from "../src/io";
import * as arbitraries from "./arbitraries";

describe("The IO.cancel function", () => {
  it("gives an IO which results in the 'canceled' outcome", async () => {
    const result = await IO.cancel().runSafe();
    expect(result).toEqual({ kind: OutcomeKind.Canceled });
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

    expect(outcome).toEqual(Outcome.Raised("error"));
  });
});

describe("The IO.onCancel method", () => {
  it("makes no difference to the outcome of the action if it succeeds", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.io, async (io) => {
        const withOnCancel = io.onCancel(IO.void);
        expect(await withOnCancel.runSafe()).toEqual(await io.runSafe());
      })
    ));

  it("runs the cancellation handler if the action is cancelled", async () => {
    let handlerRan = false;

    const io = IO.cancel().onCancel(IO(() => (handlerRan = true)));

    await io.runSafe();

    expect(handlerRan).toBe(true);
  });

  it("does not run the cancellation handler if the action succeeds", async () => {
    let handlerRan = false;

    const io = IO.wrap(123).onCancel(IO(() => (handlerRan = true)));

    await io.runSafe();

    expect(handlerRan).toBe(false);
  });

  it("does not run the cancellation handler if the action raises an error", async () => {
    let handlerRan = false;

    const io = IO.raise("an error").onCancel(IO(() => (handlerRan = true)));

    await io.runSafe();

    expect(handlerRan).toBe(false);
  });

  it("changes the outcome to raise the error if the cancellation handler raises", async () => {
    const io = IO.cancel().onCancel(IO.raise("an error"));
    expect(await io.runSafe()).toEqual(Outcome.Raised("an error"));
  });
});

describe("The IO.uncancelable function", () => {
  it("allows an action to complete even if it the fiber is canceled", async () => {
    let actionCompleted = false;

    const io = Fiber.start(
      IO.uncancelable(
        IO(() => (actionCompleted = true)).delay(30, "milliseconds")
      )
    ).andThen((fiber) =>
      fiber
        .cancel()
        .delay(10, "milliseconds")
        .andThen(() => fiber.outcome())
    );

    const outcome = await io.run();

    expect(actionCompleted).toBe(true);
    expect(outcome).toEqual(Outcome.Canceled);
  });
});
