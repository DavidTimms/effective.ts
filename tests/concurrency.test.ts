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
