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
        return expect(parallelized).toEqual(allResults);
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
});
