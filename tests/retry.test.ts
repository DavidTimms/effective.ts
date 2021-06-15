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
      fc.asyncProperty(fc.integer({ min: 0, max: 10 }), async (retryCount) => {
        let attempts = 0;
        const io = IO(() => (attempts = attempts + 1))
          .andThen(() => IO.raise("Always fails"))
          .retry(retryCount);

        await expect(io.run()).rejects.toBe("Always fails");
        expect(attempts).toBe(retryCount + 1);
      })
    ));
  it("succeeds if the IO succeeds before the retries are exhausted", () =>
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (retryCount, attemptsBeforeSuccess) => {
          fc.pre(retryCount >= attemptsBeforeSuccess);

          let attempts = 0;

          const io = IO(() => (attempts = attempts + 1))
            .andThen((attempts) =>
              attempts > attemptsBeforeSuccess
                ? IO.wrap("success")
                : IO.raise("fail")
            )
            .retry({ count: retryCount });

          await expect(io.run()).resolves.toBe("success");
        }
      )
    ));

  it("will retry if the error value passes the filter", async () => {
    let attempts = 0;
    const io = IO(() => (attempts = attempts + 1))
      .andThen(() => IO.raise("some error"))
      .retry({ count: 1, filter: (e) => e === "some error" });

    await io.runSafe();

    expect(attempts).toBe(2);
  });

  it("will not retry if the error value does not pass the filter", async () => {
    let attempts = 0;
    const io = IO(() => (attempts = attempts + 1))
      .andThen(() => IO.raise("some other error"))
      .retry({ count: 1, filter: (e) => e === "some error" });

    await io.runSafe();

    expect(attempts).toBe(1);
  });
});
