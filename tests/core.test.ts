import fc from "fast-check";
import IO, { OutcomeKind } from "../src/io";
import { range } from "./utils";
import * as arbitraries from "./arbitraries";

describe("The main IO function", () => {
  it("creates an IO which performs the side-effect when run", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (effectResult) => {
        let effectPerformedCount = 0;
        const effect = () => {
          effectPerformedCount += 1;
          return effectResult;
        };
        const io = IO(effect);
        expect(effectPerformedCount).toBe(0);
        const result = io.run();
        expect(effectPerformedCount).toBe(1);
        return expect(result).resolves.toBe(effectResult);
      })
    ));

  it("creates an IO which rejects when run if the side-effect throws", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (thrownValue) => {
        const effect = () => {
          throw thrownValue;
        };
        return expect(IO(effect).run()).rejects.toBe(thrownValue);
      })
    ));

  it("creates an IO which waits for a promise returned by the effect", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (eventualValue) => {
        const effect = () => Promise.resolve(eventualValue);
        return expect(IO(effect).run()).resolves.toBe(eventualValue);
      })
    ));
});

describe("The IO.wrap function", () => {
  it("creates an IO which returns the wrapped values when run", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (initialValue) =>
        expect(IO.wrap(initialValue).run()).resolves.toBe(initialValue)
      )
    ));
});

describe("The IO.raise function", () => {
  it("creates an IO which rejects with the raised value when run", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), (raisedValue) =>
        expect(IO.raise(raisedValue).run()).rejects.toBe(raisedValue)
      )
    ));
});

describe("The andThen method", () => {
  it("passes the output of the parent IO to the next function", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), async (initialValue) => {
        const nextFunction = jest.fn(() => IO.void);
        await IO.wrap(initialValue).andThen(nextFunction).run();
        expect(nextFunction).toHaveBeenCalledTimes(1);
        expect(nextFunction).toHaveBeenCalledWith(initialValue);
      })
    ));

  it("can be used to define recursive functions without causing a stack overflow", () => {
    function sum(numbers: number[], index = 0, total = 0): IO<number> {
      if (index >= numbers.length) return IO.wrap(total);
      return IO.wrap(total + numbers[index]).andThen((total) =>
        sum(numbers, index + 1, total)
      );
    }

    expect(sum(range(100000)).run()).resolves.toBe(4999950000);
  });

  it("allows sequencing async effects", async () => {
    const events = [];

    const firstEffect = async () => {
      events.push("start first effect");
      await new Promise((r) => setTimeout(r, 30));
      events.push("finish first effect");
    };

    const secondEffect = () => {
      events.push("start second effect");
      events.push("finish second effect");
    };

    const thirdEffect = async () => {
      events.push("start third effect");
      await new Promise((r) => setTimeout(r, 30));
      events.push("finish third effect");
    };

    const io = IO(firstEffect)
      .andThen(() => IO(secondEffect))
      .andThen(() => IO(thirdEffect));

    events.push("start run");
    await io.run();
    events.push("finish run");

    expect(events).toEqual([
      "start run",
      "start first effect",
      "finish first effect",
      "start second effect",
      "finish second effect",
      "start third effect",
      "finish third effect",
      "finish run",
    ]);
  });

  it("Does not call the next function if an error is raised", async () => {
    const nextFunction = jest.fn();
    const raiseAndThen = IO.raise(Error("Kaboom!")).andThen(nextFunction);

    expect(await raiseAndThen.runSafe()).toEqual({
      kind: OutcomeKind.Raised,
      value: Error("Kaboom!"),
    });
    expect(nextFunction).toHaveBeenCalledTimes(0);
  });
});

describe("The catch method", () => {
  it("makes no difference to IOs which succeed", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.successfulIo, async (successfulIo) => {
        const withCatch = successfulIo.catch(() => IO.wrap("caught an error"));
        expect(await withCatch.run()).toEqual(await successfulIo.run());
      })
    ));

  it("can always turn an unsuccessful IO into a successful one", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.unsuccessfulIo, async (unsuccessfulIo) => {
        const withCatch = unsuccessfulIo.catch(() =>
          IO.wrap("caught an error")
        );
        expect(await withCatch.run()).toBe("caught an error");
      })
    ));

  it("makes no differences if it re-raises the error unchanged", () =>
    fc.assert(
      fc.asyncProperty(arbitraries.io, async (io) => {
        const withCatch = io.catch(IO.raise);
        expect(await withCatch.runSafe()).toEqual(await io.runSafe());
      })
    ));

  it("catches errors previously raised", () => {
    const io = IO.raise("the roof").catch((errorMessage) =>
      IO.wrap("Raised " + errorMessage + "!")
    );

    return expect(io.run()).resolves.toBe("Raised the roof!");
  });

  it("catches errors thrown in deferred effects", () => {
    const io = IO(() => {
      throw "some shapes";
    }).catch((errorMessage) => IO.wrap("Threw " + errorMessage + "!"));

    return expect(io.run()).resolves.toBe("Threw some shapes!");
  });

  it(
    "Only catches exceptions raised or thrown in deferred effects , " +
      "not `andThen` functions",
    () => {
      const error = Error("errors should be raised, not thrown");
      const io = IO.void
        .andThen(() => {
          throw error;
        })
        .catch((e) => IO.wrap(e));

      return expect(io.run()).rejects.toBe(error);
    }
  );
});
