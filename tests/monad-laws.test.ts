import fc from "fast-check";
import IO from "../src/io";

describe("The IO type", () => {
  it("obeys the left-identity law", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        fc.anything().map(IO.wrap),
        async (a, b) => {
          const f = (value: unknown) => IO.wrap(b);
          const left = IO.wrap(a).andThen(f);
          const right = f(a);
          expect(await left.run()).toEqual(await right.run());
        }
      )
    ));
});
