import { Fiber, IO, Outcome } from "../src/io";

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

    await expect(io.run()).resolves.toEqual(Outcome.Succeeded("success"));
  });

  it("returns an IO which produces the fiber's outcome if the fiber raises an error", async () => {
    const io = Fiber.start(IO.raise("error")).andThen((fiber) =>
      fiber.outcome()
    );

    await expect(io.run()).resolves.toEqual(Outcome.Raised("error"));
  });

  it("returns an IO which produces the fiber's outcome if the fiber is canceled", async () => {
    const io = Fiber.start(IO.cancel()).andThen((fiber) => fiber.outcome());

    await expect(io.run()).resolves.toEqual(Outcome.Canceled);
  });
});

describe("The Fiber.cancel method", () => {
  it("returns an IO which stops the execution of the fiber", async () => {
    let count = 0;

    const fiberProgram = IO(() => (count += 1))
      .delay(20, "milliseconds")
      .repeatForever();

    const io = Fiber.start(fiberProgram)
      .through(() => IO.wait(50, "milliseconds"))
      .andThen((fiber) => fiber.cancel())
      .andThen(() => IO.wait(50, "milliseconds"));

    await io.runSafe();

    expect(count).toBe(2);
  });

  it("returns an IO which makes the outcome of the fiber 'Canceled'", async () => {
    const fiberProgram = IO.wrap(123).delay(1, "second");

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.runSafe();

    expect(outcome).toEqual(Outcome.Succeeded(Outcome.Canceled));
  });

  it("does not affect the outcome of the fiber if it has already succeeded", async () => {
    const fiberProgram = IO.wrap(123);

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.runSafe();

    expect(outcome).toEqual(Outcome.Succeeded(Outcome.Succeeded(123)));
  });

  it("does not affect the outcome of the fiber if it has already succeeded with an async step", async () => {
    const fiberProgram = IO.wrap(123).delay(10, "milliseconds");

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.outcome())
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.runSafe();

    expect(outcome).toEqual(Outcome.Succeeded(Outcome.Succeeded(123)));
  });

  it("does not affect the outcome of the fiber if it has already raised", async () => {
    const fiberProgram = IO.raise("an error");

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.runSafe();

    expect(outcome).toEqual(Outcome.Succeeded(Outcome.Raised("an error")));
  });

  it("has no effect if the fiber is already canceled", async () => {
    const fiberProgram = IO.wrap(true).delay(2, "seconds");

    const io = Fiber.start(fiberProgram)
      .through((fiber) => fiber.cancel())
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.runSafe();

    expect(outcome).toEqual(Outcome.Succeeded(Outcome.Canceled));
  });
});
