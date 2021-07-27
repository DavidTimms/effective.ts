import fc from "fast-check";
import IO, { Fiber, IOResult, TimeoutError } from "../src/io";
import { successfulIo } from "./arbitraries";

describe("The IO.sequence function", () => {
  it("combines an array of IOs into a single IO returning an array of the results", () =>
    fc.assert(
      fc.asyncProperty(fc.array(successfulIo), async (actions) => {
        const allResults = await Promise.all(actions.map((io) => io.run()));
        const sequenced = await IO.sequence(actions).run();
        return expect(sequenced).toEqual(allResults);
      })
    ));

  it("stops at the first error encountered", async () => {
    const events: Array<string> = [];
    const firstEffect = IO(() => events.push("first effect"));
    const secondEffect = IO(() => events.push("second effect")).andThen(() =>
      IO.raise("Something went wrong")
    );
    const thirdEffect = IO(() => events.push("third effect"));
    const sequenced = IO.sequence([firstEffect, secondEffect, thirdEffect]);
    await expect(sequenced.run()).rejects.toBe("Something went wrong");
    expect(events).toEqual(["first effect", "second effect"]);
  });

  it("infers the correct return type for heterogenous tuples", async () => {
    const tuple = [IO.wrap(123), IO.wrap("foo"), IO.wrap(true)] as const;
    const sequenced = IO.sequence(tuple);
    const [a, b, c] = await sequenced.run();
    expect(a - 1).toBe(122);
    expect(b.toUpperCase()).toBe("FOO");
    expect(c === true).toBe(true);
  });
});

describe("The IO.parallel function", () => {
  it("combines an array of IOs into a single IO returning an array of the results", () =>
    fc.assert(
      fc.asyncProperty(fc.array(successfulIo), async (actions) => {
        const allResults = await Promise.all(actions.map((io) => io.run()));
        const parallelized = await IO.parallel(actions).run();
        expect(parallelized).toEqual(allResults);
      })
    ));

  it("performed all effects even if some fail", async () => {
    const events: Array<string> = [];
    const firstEffect = IO(() => events.push("first effect"));
    const secondEffect = IO(() => events.push("second effect")).andThen(() =>
      IO.raise("Something went wrong")
    );
    const thirdEffect = IO(() => events.push("third effect"));
    const parallelized = IO.parallel([firstEffect, secondEffect, thirdEffect]);
    await expect(parallelized.run()).rejects.toBe("Something went wrong");
    expect(events).toEqual(["first effect", "second effect", "third effect"]);
  });

  it("infers the correct return type for heterogenous tuples", async () => {
    const tuple = [IO.wrap(123), IO.wrap("foo"), IO.wrap(true)] as const;
    const parallelized = IO.parallel(tuple);
    const [a, b, c] = await parallelized.run();
    expect(a - 1).toBe(122);
    expect(b.toUpperCase()).toBe("FOO");
    expect(c === true).toBe(true);
  });

  it("avoids unsoundness in the catch block if an error is thrown outside of the IO system", async () => {
    const throwsUnsoundly = (IO.void as IO<void, TypeError>).andThen(() => {
      if (true) throw SyntaxError();
      return IO.void;
    });

    const catcher = jest.fn(() => IO.void);

    const parallelWithCatch = IO.parallel([IO.void, throwsUnsoundly]).catch(
      catcher
    );

    await expect(parallelWithCatch.run()).rejects.toEqual(SyntaxError());
    expect(catcher).toHaveBeenCalledTimes(0);
  });

  it("rejects as soon as the first effect fails, without waiting for the others", async () => {
    const events: Array<string> = [];

    const failsSlowly = IO.wait(30, "seconds")
      .andThen(() => IO(() => events.push("long sleep is over")))
      .andThen(() => IO.raise(Error("failed slowly")));

    const failsQuickly = IO.wait(10, "milliseconds")
      .andThen(() => IO(() => events.push("short sleep is over")))
      .andThen(() => IO.raise(Error("failed quickly")));

    const inParallel = IO.parallel([failsSlowly, failsQuickly]);

    expect(await inParallel.runSafe()).toEqual(
      IOResult.Raised(Error("failed quickly"))
    );
    expect(events).toEqual(["short sleep is over"]);
  });

  it("cancels the calling fiber if any of the actions cancel themselves", async () => {
    const events: Array<string> = [];

    const succeedsSlowly = IO(() => events.push("starting action 1"))
      .andThen(() => IO.wait(2, "seconds"))
      .andThen(() => IO(() => events.push("completing action 1")));

    const cancelsQuickly = IO(() => events.push("starting action 2"))
      .andThen(() => IO.wait(10, "milliseconds"))
      .andThen(() => IO.cancel());

    const failsSlowly = IO(() => events.push("starting action 3"))
      .andThen(() => IO.wait(3, "seconds"))
      .andThen(() => IO.raise("error"));

    const inParallel = IO.parallel([
      succeedsSlowly,
      cancelsQuickly,
      failsSlowly,
    ]);

    await expect(inParallel.runSafe()).resolves.toEqual(IOResult.Canceled);
    expect(events).toEqual([
      "starting action 1",
      "starting action 2",
      "starting action 3",
    ]);
  });

  it("cancels the child fibers if the calling fiber is canceled", async () => {
    let events: string[] = [];

    const io = Fiber.start(
      IO.parallel([
        IO(() => events.push("parallel IO 1 completed")).delay(
          50,
          "milliseconds"
        ),
        IO(() => events.push("parallel IO 2 completed")).delay(
          100,
          "milliseconds"
        ),
      ])
    )
      .andThen((fiber) => fiber.cancel().delay(10, "milliseconds"))
      .andThen(() => IO(() => events.push("calling fiber canceled")))
      .andThen(() => IO.wait(20, "milliseconds"));

    await io.runSafe();

    expect(events).toEqual(["calling fiber canceled"]);
  });

  // This test currently fails because there is a race condition. There is
  // a microscopic gap between starting the fibers and setting up the
  // "onCancel" handler. If the calling fiber is cancelled in this gap, the
  // fibers will not be canceled. I think the way to fix this is to introduce
  // an "uncancelable" mechanism.
  it.skip("cancels the child fibers if the calling fiber is canceled immediately", async () => {
    let events: string[] = [];

    const io = Fiber.start(
      IO.parallel([
        IO(() => events.push("parallel IO 1 completed")).delay(
          15,
          "milliseconds"
        ),
        IO(() => events.push("parallel IO 2 completed")).delay(
          10,
          "milliseconds"
        ),
      ])
    )
      .andThen((fiber) => fiber.cancel())
      .andThen(() => IO(() => events.push("calling fiber canceled")))
      .andThen(() => IO.wait(20, "milliseconds"));

    await io.runSafe();

    expect(events).toEqual(["calling fiber canceled"]);
  });
});

describe("The IO.race function", () => {
  it("combines an array of IOs into a single IO returning the earliest result to resolve", () =>
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 4 }).map((int) => int * 10)),
        async (delays) => {
          // IO.race does not allow empty arrays
          fc.pre(delays.length > 0);

          // An array of actions which each wait the specified delay
          // before returning its value.
          const actions = delays.map((delay) =>
            IO.wrap(delay).delay(delay, "milliseconds")
          );

          const expectedWinner = Math.min(...delays);
          const raced = IO.race([actions[0], ...actions.slice(1)]);
          const winner = await raced.run();
          return expect(winner).toEqual(expectedWinner);
        }
      )
    ));

  it("stops at the earliest error encountered", async () => {
    const failsSlowly = IO.raise("failed slowly").delay(100, "milliseconds");
    const succeeds = IO.wrap("succeeded").delay(50, "milliseconds");
    const failsQuickly = IO.raise("failed quickly").delay(10, "milliseconds");
    const raced = IO.race([failsSlowly, succeeds, failsQuickly]);
    await expect(raced.run()).rejects.toBe("failed quickly");
  });

  it("infers the union of the value and error types", async () => {
    const raced: IO<number | boolean, string | Error> = IO.race([
      IO.wrap(123),
      IO.wrap(true),
      IO.raise("bang!"),
      IO.raise(Error()),
    ]);
  });

  it("cancels the calling fiber if all raced IOs cancel themselves", async () => {
    const io = IO.race([IO.cancel(), IO.cancel().delay(5, "milliseconds")]);
    const outcome = await io.runSafe();
    expect(outcome).toEqual(IOResult.Canceled);
  });

  it("ignores IOs which cancel themselves as long as one finishes", async () => {
    const io = IO.race([
      IO.cancel(),
      IO.wrap("result").delay(10, "milliseconds"),
      IO.cancel().delay(5, "milliseconds"),
    ]);
    const outcome = await io.runSafe();
    expect(outcome).toEqual(IOResult.Succeeded("result"));
  });

  it("cancels the child fibers if the calling fiber is canceled", async () => {
    let events: string[] = [];

    const io = Fiber.start(
      IO.race([
        IO(() => events.push("raced IO 1 completed")).delay(50, "milliseconds"),
        IO(() => events.push("raced IO 2 completed")).delay(85, "milliseconds"),
      ])
    )
      .andThen((fiber) => fiber.cancel().delay(10, "milliseconds"))
      .andThen(() => IO(() => events.push("calling fiber canceled")))
      .andThen(() => IO.wait(20, "milliseconds"));

    await io.runSafe();

    expect(events).toEqual(["calling fiber canceled"]);
  });

  // See equivalent test for description of the bug.
  it.skip("cancels the child fibers if the calling fiber is canceled immediately", async () => {
    let events: string[] = [];

    const io = Fiber.start(
      IO.race([
        IO(() => events.push("raced IO 1 completed")).delay(15, "milliseconds"),
        IO(() => events.push("raced IO 2 completed")).delay(10, "milliseconds"),
      ])
    )
      .andThen((fiber) => fiber.cancel())
      .andThen(() => IO(() => events.push("calling fiber canceled")))
      .andThen(() => IO.wait(20, "milliseconds"));

    await io.runSafe();

    expect(events).toEqual(["calling fiber canceled"]);
  });

  it("raises a runtime type error if called with an empty array", async () => {
    const io = IO.race([]);
    const outcome = await io.runSafe();
    expect(outcome).toEqual(IOResult.Raised(expect.any(TypeError)));
  });
});

describe("The repeatForever method", () => {
  it("returns an IO which repeats the action infinitely", async () => {
    let performedCount = 0;

    const infinite = IO(() => (performedCount += 1))
      .andThen(() => IO.wait(100, "milliseconds"))
      .repeatForever();

    const withTimeout = infinite.timeout(350, "milliseconds");

    await expect(withTimeout.run()).rejects.toEqual(expect.any(TimeoutError));
    expect(performedCount).toBe(4);
  });
});
