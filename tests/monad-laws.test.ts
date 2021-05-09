import fc from "fast-check";
import IO from "../src/io";

describe("The IO type is a valid monad", () => {
  it("obeys the law that `wrap` is a left-identity for `andThen`", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        fc.anything().map(IO.wrap),
        async (a, b) => {
          const f = (a: unknown) => IO.wrap(b);
          const left = IO.wrap(a).andThen(f);
          const right = f(a);
          expect(await left.run()).toEqual(await right.run());
        }
      )
    ));

  it("obeys the law that `wrap` is a right-identity for `andThen`", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything().map(IO.wrap),
        fc.anything(),
        async (ioA) => {
          const andThenWithWrap = ioA.andThen((a) => IO.wrap(a));
          expect(await andThenWithWrap.run()).toEqual(await ioA.run());
        }
      )
    ));

  it("obeys the law that bind is associative", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything().map(IO.wrap),
        fc.anything().map(IO.wrap),
        async (ioA, ioB) => {
          const f = (_: unknown) => ioA;
          const g = (_: unknown) => ioB;
          const left = ioA.andThen((a) => f(a).andThen((b) => g(b)));
          const right = ioA.andThen((a) => f(a)).andThen((b) => g(b));
          expect(await left.run()).toEqual(await right.run());
        }
      )
    ));
});
