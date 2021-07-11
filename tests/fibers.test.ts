import { Fiber, IO, IOResult } from "../src/io";

describe("The Fiber.start function", () => {
  it("return an IO which runs the provided IO in an fiber, without blocking", async () => {
    const eventsEmitted: string[] = [];

    function emit(event: string): IO<void> {
      return IO(() => void eventsEmitted.push(event));
    }

    const io = emit("before fiber starts")
      .andThen(() =>
        Fiber.start(emit("fiber is running").delay(20, "milliseconds"))
      )
      .andThen(() => emit("after fiber starts"))
      .andThen(() => IO.wait(30, "milliseconds"))
      .andThen(() => emit("after fiber finishes"));

    await io.run();

    expect(eventsEmitted).toEqual([
      "before fiber starts",
      "after fiber starts",
      "fiber is running",
      "after fiber finishes",
    ]);
  });
});

describe("The Fiber.outcome method", () => {
  it("returns an IO which blocks execution until the fiber finishes", async () => {
    const eventsEmitted: string[] = [];

    function emit(event: string): IO<void> {
      return IO(() => void eventsEmitted.push(event));
    }

    const io = emit("before fiber starts")
      .andThen(() =>
        Fiber.start(emit("fiber is running").delay(20, "milliseconds"))
      )
      .andThen((fiber) => fiber.outcome())
      .andThen(() => emit("after fiber finishes"));

    await io.run();

    expect(eventsEmitted).toEqual([
      "before fiber starts",
      "fiber is running",
      "after fiber finishes",
    ]);
  });

  it("returns an IO which produces the fiber's outcome if the fiber succeeds", async () => {
    const io = Fiber.start(IO.wrap("success")).andThen((fiber) =>
      fiber.outcome()
    );

    await expect(io.run()).resolves.toEqual(IOResult.Succeeded("success"));
  });

  it("returns an IO which produces the fiber's outcome if the fiber raises an error", async () => {
    const io = Fiber.start(IO.raise("error")).andThen((fiber) =>
      fiber.outcome()
    );

    await expect(io.run()).resolves.toEqual(IOResult.Raised("error"));
  });

  it("returns an IO which produces the fiber's outcome if the fiber is canceled", async () => {
    const io = Fiber.start(IO.cancel()).andThen((fiber) => fiber.outcome());

    await expect(io.run()).resolves.toEqual(IOResult.Canceled);
  });
});
