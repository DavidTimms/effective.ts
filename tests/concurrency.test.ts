import fc from "fast-check";
import IO from "../src/io";
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
    // This test currently causes jest to print a warning because the
    // timer in the slow action is not cancelled, causing the process
    // to stay active after the test run has finished. This should be
    // resolved once the system supports cancellation.
    const events: Array<string> = [];

    const failsSlowly = IO.wait(30, "seconds")
      .andThen(() => IO(() => events.push("long sleep is over")))
      .andThen(() => IO.raise(Error("failed slowly")));

    const failsQuickly = IO.wait(10, "milliseconds")
      .andThen(() => IO(() => events.push("short sleep is over")))
      .andThen(() => IO.raise(Error("failed quickly")));

    const inParallel = IO.parallel([failsSlowly, failsQuickly]);

    await expect(inParallel.run()).rejects.toEqual(Error("failed quickly"));
    expect(events).toEqual(["short sleep is over"]);
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
    const succeeeds = IO.wrap("succeeeded").delay(50, "milliseconds");
    const failsQuickly = IO.raise("failed quickly").delay(10, "milliseconds");
    const raced = IO.race([failsSlowly, succeeeds, failsQuickly]);
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
});

describe("The repeatForever method", () => {
  it("returns an IO which repeats the action infinitely", async () => {
    let performedCount = 0;

    const infinite = IO(() => (performedCount += 1))
      .andThen(() => IO.wait(100, "milliseconds"))
      .repeatForever();

    const withTimeout = IO.parallel([
      infinite,
      IO.wait(350, "milliseconds").andThen(() => IO.raise("time's up")),
    ]);

    await expect(withTimeout.run()).rejects.toEqual("time's up");
    expect(performedCount).toBe(4);
  });
});
