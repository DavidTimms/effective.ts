import fc from "fast-check";
import * as arbitraries from "./arbitraries";

describe("The as method", () => {
  it("replaces the resulting value of a successful IO with the provided value", () =>
    fc.assert(
      fc.asyncProperty(
        arbitraries.successfulIo,
        fc.anything(),
        async (io, replacementValue) => {
          await expect(io.as(replacementValue).run()).resolves.toBe(
            replacementValue
          );
        }
      )
    ));
  it("has no effect on an IO which fails", () =>
    fc.assert(
      fc.asyncProperty(
        arbitraries.unsuccessfulIo,
        fc.anything(),
        async (io, replacementValue) => {
          const resultWithAs = await io.as(replacementValue).runSafe();
          const resultWithoutAs = await io.runSafe();
          expect(resultWithAs).toEqual(resultWithoutAs);
        }
      )
    ));
});
