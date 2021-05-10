import fc from "fast-check";
import IO from "../src/io";
import { range } from "./utils";

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
});
