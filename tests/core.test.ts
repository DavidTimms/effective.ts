import fc from "fast-check";
import IO from "../src/io";

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
