import fc from "fast-check";
import IO from "../src/io";
import * as arbitraries from "./arbitraries";

describe("The IO type is a valid monad", () => {
  it("obeys the law that `wrap` is a left-identity for `andThen`", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        arbitraries.unaryFunction.map(IO.lift),
        async (x, f) => {
          const wrapPlusAndThen = IO.wrap(x).andThen(f);
          const directCall = f(x);
          expect(await wrapPlusAndThen.run()).toEqual(await directCall.run());
        }
      )
    ));

  it("obeys the law that `wrap` is a right-identity for `andThen`", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.io, async (io) => {
        const andThenWithWrap = io.andThen((a) => IO.wrap(a));
        expect(await andThenWithWrap.run()).toEqual(await io.run());
      })
    ));

  it("obeys the law that bind is associative", () =>
    fc.assert(
      fc.asyncProperty(
        arbitraries.io,
        arbitraries.unaryFunction.map(IO.lift),
        arbitraries.unaryFunction.map(IO.lift),
        async (io, f, g) => {
          const leftAssociative = io.andThen((a) => f(a).andThen((b) => g(b)));
          const rightAssociative = io.andThen((a) => f(a)).andThen((b) => g(b));
          expect(await leftAssociative.run()).toEqual(
            await rightAssociative.run()
          );
        }
      )
    ));
});
