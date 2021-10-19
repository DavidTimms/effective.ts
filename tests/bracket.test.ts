import fc from "fast-check";
import IO, { Fiber, IOResult } from "../src/io";
import * as arbitraries from "./arbitraries";

describe("The IO.bracket function", () => {
  it("Propagates any errors raised by the open function", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.unsuccessfulIo, async (willRaise) => {
        const bracketed = IO.bracket(willRaise, () => IO.void)(() => IO.void);
        expect(await bracketed.runSafe()).toEqual(await willRaise.runSafe());
      })
    ));

  it("Propagates any errors raised by the use function", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.unsuccessfulIo, async (willRaise) => {
        const bracketed = IO.bracket(
          IO.wrap(null),
          () => IO.void
        )(() => willRaise);
        expect(await bracketed.runSafe()).toEqual(await willRaise.runSafe());
      })
    ));

  it("Propagates any errors raised by the close function", () =>
    fc.assert(
      fc.asyncProperty(
        arbitraries.io,
        arbitraries.unsuccessfulIo,
        async (mightRaise, willRaise) => {
          // If the `use` function raises, it still calls the `close` function.
          // If `close` also raises, the error from `close` takes priority.
          const bracketed = IO.bracket(
            IO.wrap(null),
            () => willRaise
          )(() => mightRaise);
          expect(await bracketed.runSafe()).toEqual(await willRaise.runSafe());
        }
      )
    ));

  it("Will always call the close function if the open function succeeds", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        arbitraries.io,
        async (a, ioWithAnyOutcome) => {
          const close = jest.fn(() => IO.void);

          const bracketed = IO.bracket(
            IO.wrap(a),
            close
          )(() => ioWithAnyOutcome);

          await bracketed.runSafe();

          expect(close).toHaveBeenCalledWith(a);
        }
      )
    ));

  it("Will always give the same outcome as the use function if open and close succeed", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.io, async (ioWithAnyOutcome) => {
        const bracketed = IO.bracket(
          IO.void,
          () => IO.void
        )(() => ioWithAnyOutcome);

        expect(await bracketed.runSafe()).toEqual(
          await ioWithAnyOutcome.runSafe()
        );
      })
    ));

  it("Will call the close function even if the fiber is immediately canceled", async () => {
    const open = IO.void;
    const close = jest.fn(() => IO.void);
    const use = () => IO.void;
    const io = Fiber.start(IO.bracket(open, close)(use)).andThen((fiber) =>
      fiber.cancel()
    );

    await io.runSafe();

    expect(close).toHaveBeenCalled();
  });

  it("Will allow cancellation of the open action", async () => {
    const open = IO.void.delay(30, "seconds");
    const close = jest.fn(() => IO.void);
    const use = jest.fn(() => IO.void);
    const io = Fiber.start(IO.bracket(open, close)(use))
      .through(() => IO.wait(200, "milliseconds"))
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.run();
    expect(outcome).toEqual(IOResult.Canceled);
    expect(use).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("Will allow cancellation of the use action", async () => {
    const open = IO.void;
    const close = jest.fn(() => IO.void);
    const use = jest.fn(() => IO.void.delay(30, "seconds"));
    const io = Fiber.start(IO.bracket(open, close)(use))
      .through(() => IO.wait(200, "milliseconds"))
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.run();
    expect(outcome).toEqual(IOResult.Canceled);
    expect(close).not.toHaveBeenCalled();
  });

  it("Will allow cancellation of the close action", async () => {
    const open = IO.void;
    const close = jest.fn(() => IO.void.delay(30, "seconds"));
    const use = jest.fn(() => IO.void);
    const io = Fiber.start(IO.bracket(open, close)(use))
      .through(() => IO.wait(200, "milliseconds"))
      .through((fiber) => fiber.cancel())
      .andThen((fiber) => fiber.outcome());

    const outcome = await io.run();
    expect(outcome).toEqual(IOResult.Canceled);
  });
});
