import fc, { Arbitrary } from "fast-check";
import IO from "../src/io";

export const io: Arbitrary<IO<unknown>> = fc
  .anything()
  .chain((value) =>
    fc.oneof(
      fc.constant(IO.wrap(value)),
      fc.constant(IO(() => value)),
      fc.constant(IO.void.andThen(() => IO.wrap(value)))
    )
  );

export const unaryFunction: Arbitrary<
  (y: unknown) => unknown
> = fc.anything().chain((x) =>
  fc.oneof(
    fc.constant((y: any) => y),
    fc.constant((y: any) => x),
    fc.constant((y: any) => x + y)
  )
);