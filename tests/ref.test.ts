import fc from "fast-check";
import IO from "../src/io";
import { Ref } from "../src/ref";
import { range } from "./utils";

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

  it("performs the modify operation without context switching to other fibers, avoiding race conditions", async () => {
    // This test starts a thousand parallel fibers which each
    // wait a random number of milliseconds (between 0 and 10)
    // before incrementing the counter. This simulates many
    // concurrent fibers modifying the same ref. If any of the
    // updates were lost, the eventual total would incorrectly
    // be less than 1000.

    const program = Ref.create(0)
      .through((ref) =>
        IO.parallel(
          range(1000).map(() =>
            IO(() => Math.floor(Math.random() * 10)).andThen((jitterMs) =>
              ref.modify((count) => count + 1).delay(jitterMs, "milliseconds")
            )
          )
        )
      )
      .andThen(Ref.get);

    const result = await program.run();
    expect(result).toBe(1000);
  });
});
