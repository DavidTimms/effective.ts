import fc from "fast-check";
import IO from "../src/io";
import { io } from "./arbitraries";

describe("The retry method", () => {
  it("does not affect the returned result for a deterministic IO", () =>
    fc.assert(
      fc.asyncProperty(
        io,
        fc.integer({ min: 0, max: 10 }),
        async (io, retryCount) => {
          expect(await io.retry(retryCount).runSafe()).toEqual(
            await io.runSafe()
          );
        }
      )
    ));
  it("performs the effect N + 1 times if it continues to fail", () =>
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 3, max: 10 }), async (retryCount) => {
        let attempts = 0;
        const io = IO(() => (attempts = attempts + 1))
          .andThen(() => IO.raise("Always fails"))
          .retry(retryCount);

        await expect(io.run()).rejects.toBe("Always fails");
        expect(attempts).toBe(retryCount + 1);
      })
    ));
});
