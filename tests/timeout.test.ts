import fc from "fast-check";
import { TimeoutError } from "../src/errors";
import { io } from "./arbitraries";

describe("The timeout method", () => {
  it("raises a Timeout error if the action takes longer than the timeout", () =>
    fc.assert(
      fc.asyncProperty(
        io,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        async (io, msToComplete, msToTimeout) => {
          fc.pre(msToComplete > msToTimeout);
          await expect(
            io
              .delay(msToComplete, "milliseconds")
              .timeout(msToTimeout, "milliseconds")
              .run()
          ).rejects.toEqual(new TimeoutError());
        }
      )
    ));

  it("returns the same result as the base action if it completes within the timeout", () =>
    fc.assert(
      fc.asyncProperty(
        io,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        async (io, msToComplete, msToTimeout) => {
          fc.pre(msToComplete <= msToTimeout);
          expect(
            await io
              .delay(msToComplete, "milliseconds")
              .timeout(msToTimeout, "milliseconds")
              .runSafe()
          ).toEqual(await io.runSafe());
        }
      )
    ));
});
