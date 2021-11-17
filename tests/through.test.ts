import fc from "fast-check";
import { OutcomeKind } from "../src/io";
import * as arbitraries from "./arbitraries";

describe("The through method", () => {
  it("adds another IO which will run after the target IO, but retains the original result", () =>
    fc.assert(
      fc.asyncProperty(
        arbitraries.io,
        arbitraries.successfulIo,
        async (firstIo, secondIo) => {
          const firstIoResult = await firstIo.runSafe();

          const throughFunc = jest.fn(() => secondIo);
          const resultThroughAdditionalIo = await firstIo
            .through(throughFunc)
            .runSafe();

          expect(resultThroughAdditionalIo).toEqual(firstIoResult);

          if (firstIoResult.kind === OutcomeKind.Succeeded) {
            expect(throughFunc).toHaveBeenCalledTimes(1);
            expect(throughFunc).toHaveBeenCalledWith(firstIoResult.value);
          } else {
            expect(throughFunc).toHaveBeenCalledTimes(0);
          }
        }
      )
    ));
});
