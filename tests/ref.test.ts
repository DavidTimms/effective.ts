import fc from "fast-check";
import IO from "../src/io";
import { Ref } from "../src/ref";

describe("the Ref class", () => {
  it("can be created with an initial value", () =>
    fc.assert(
      fc.asyncProperty(fc.anything(), async (initialValue) => {
        const program = Ref.create(initialValue).andThen(Ref.get);
        const result = await program.run();
        expect(result).toBe(initialValue);
      })
    ));

  it("can be created empty, so the value is null", async () => {
    const program = Ref.empty<number>().andThen((ref) => ref.get);
    const result = await program.run();
    expect(result).toBe(null);
  });

  it("can be updated using the set instance method", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        fc.anything(),
        async (initialValue, newValue) => {
          const program = Ref.create(initialValue)
            .through((ref) => ref.set(newValue))
            .andThen((ref) => ref.get);
          const result = await program.run();
          expect(result).toBe(newValue);
        }
      )
    ));

  it("can be updated using the set static method", () =>
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        fc.anything(),
        async (initialValue, newValue) => {
          const program = Ref.create(initialValue)
            .through(Ref.set(newValue))
            .andThen(Ref.get);
          const result = await program.run();
          expect(result).toBe(newValue);
        }
      )
    ));

  it("can be updated with a pure function using the modify instance method", () =>
    fc.assert(
      fc.asyncProperty(fc.integer(), async (initialValue) => {
        const program = Ref.create(initialValue).andThen((ref) =>
          // return a tuple of the result of "modify" and the ref's value
          // afterwards, to check they are equal.
          IO.sequence([ref.modify((x) => x + 1), ref.get] as const)
        );

        const result = await program.run();
        expect(result[0]).toBe(initialValue + 1);
        expect(result[1]).toBe(initialValue + 1);
      })
    ));

  it("can be updated with a pure function using the modify static method", () =>
    fc.assert(
      fc.asyncProperty(fc.integer(), async (initialValue) => {
        const program = Ref.create(initialValue).andThen((ref) =>
          // return a tuple of the result of "modify" and the ref's value
          // afterwards, to check they are equal.
          IO.sequence([Ref.modify((x: number) => x + 1)(ref), ref.get] as const)
        );

        const result = await program.run();
        expect(result[0]).toBe(initialValue + 1);
        expect(result[1]).toBe(initialValue + 1);
      })
    ));
});
