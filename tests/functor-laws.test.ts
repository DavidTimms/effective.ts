import fc from "fast-check";
import * as arbitraries from "./arbitraries";

describe("The IO type is a valid functor (in two different ways!)", () => {
  describe("The map method", () => {
    it("always produces the same value when mapped with the identity function", () =>
      fc.assert(
        fc.asyncProperty(arbitraries.successfulIo, async (io) => {
          const identity = <X>(x: X) => x;
          expect(await io.map(identity).run()).toBe(await io.run());
        })
      ));

    it("always produces the same value when mapping two functions separately or as one", () =>
      fc.assert(
        fc.asyncProperty(
          arbitraries.successfulIo,
          arbitraries.unaryFunction,
          arbitraries.unaryFunction,
          async (io, f, g) => {
            const doubleMapped = io.map(f).map(g);
            const composed = io.map((x) => g(f(x)));
            expect(await doubleMapped.run()).toBe(await composed.run());
          }
        )
      ));
  });

  describe("The mapError method", () => {
    it("always produces the same value when mapped with the identity function", () =>
      fc.assert(
        fc.asyncProperty(arbitraries.unsuccessfulIo, async (unsuccessfulIo) => {
          const identity = <X>(x: X) => x;
          expect(await unsuccessfulIo.mapError(identity).runSafe()).toEqual(
            await unsuccessfulIo.runSafe()
          );
        })
      ));

    it("always produces the same value when mapping two functions separately or as one", () =>
      fc.assert(
        fc.asyncProperty(
          arbitraries.unsuccessfulIo,
          arbitraries.unaryFunction,
          arbitraries.unaryFunction,
          async (unsuccessfulIo, f, g) => {
            const doubleMapped = unsuccessfulIo.mapError(f).mapError(g);
            const composed = unsuccessfulIo.mapError((x) => g(f(x)));
            expect(await doubleMapped.runSafe()).toEqual(
              await composed.runSafe()
            );
          }
        )
      ));
  });
});
