import { TimeoutError } from "./errors";

export { TimeoutError };

type IO<A, E = unknown> =
  | Wrap<A, E>
  | Defer<A, E>
  | AndThen<A, E, any, E>
  | Raise<A, E>
  | Catch<A, E, any, any, any>;

export enum IOOutcome {
  Succeeded,
  Raised,
}

export type IOResult<A, E> =
  | { outcome: IOOutcome.Succeeded; value: A }
  | { outcome: IOOutcome.Raised; value: E };

export type RetryOptions<E = unknown> = {
  /** The number of times to retry. */
  count: number;

  /**
   * A predicate which will be called to decide whether a
   * raised error should be retried.
   **/
  filter?: (error: E) => boolean;
  delay?: Duration;
};

export const RetryOptions = {
  defaults: {
    filter: () => true,
    delay: [0, "milliseconds"],
  },
} as const;

abstract class IOBase<A, E = unknown> {
  abstract runSafe(): Promise<IOResult<A, E>>;

  async run(): Promise<A> {
    const result = await this.runSafe();
    if (result.outcome === IOOutcome.Succeeded) {
      return result.value;
    } else {
      throw result.value;
    }
  }

  andThen<B, E2>(this: IO<A, E>, next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map<B>(this: IO<A, E>, mapping: (a: A) => B): IO<B, E> {
    return this.andThen((a) => IO.wrap(mapping(a)));
  }

  catch<B, E2>(this: IO<A, E>, catcher: (e: E) => IO<B, E2>): IO<A | B, E2> {
    return new Catch(this, catcher);
  }

  mapError<E2>(this: IO<A, E>, mapping: (e: E) => E2): IO<A, E2> {
    return this.catch((e) => IO.raise(mapping(e)));
  }

  as<B>(this: IO<A, E>, value: B): IO<B, E> {
    const wrappedValue = IO.wrap(value);
    return this.andThen(() => wrappedValue);
  }

  repeatForever(this: IO<A, E>): IO<never, E> {
    return this.andThen(() => this.repeatForever());
  }

  delay(this: IO<A, E>, time: number, units: TimeUnits): IO<A, E> {
    if (time > 0) {
      return IO.wait(time, units).andThen(() => this);
    } else {
      return this;
    }
  }

  timeout(
    this: IO<A, E>,
    time: number,
    units: TimeUnits
  ): IO<A, E | TimeoutError> {
    return IO.race([
      this,
      IO.wait(time, units).andThen(() => IO.raise(new TimeoutError())),
    ]);
  }

  /**
   * Re-run the IO if it raises an error, up to the given number of times.
   **/
  retry(this: IO<A, E>, retryCount: number): IO<A, E>;
  retry(this: IO<A, E>, options: RetryOptions<E>): IO<A, E>;
  retry(this: IO<A, E>, countOrOptions: number | RetryOptions<E>): IO<A, E> {
    const options: Required<RetryOptions<E>> =
      typeof countOrOptions === "number"
        ? { count: countOrOptions, ...RetryOptions.defaults }
        : { ...RetryOptions.defaults, ...countOrOptions };

    const nextAttempt = (remaining: number): IO<A, E> => {
      if (remaining < 1) {
        return this;
      } else {
        return this.catch((error) =>
          options.filter(error)
            ? nextAttempt(remaining - 1).delay(...options.delay)
            : IO.raise(error)
        );
      }
    };

    return nextAttempt(options.count);
  }
}

class Wrap<A, E> extends IOBase<A, E> {
  constructor(private readonly value: A) {
    super();
  }

  async run(): Promise<A> {
    return this.value;
  }

  async runSafe(): Promise<IOResult<A, E>> {
    return { outcome: IOOutcome.Succeeded, value: this.value };
  }
}

class Defer<A, E> extends IOBase<A, E> {
  constructor(private readonly effect: () => Promise<A> | A) {
    super();
  }

  async run(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  async runSafe(): Promise<IOResult<A, E>> {
    const effect = this.effect;
    try {
      const value = await effect();
      return { outcome: IOOutcome.Succeeded, value };
    } catch (e: unknown) {
      return { outcome: IOOutcome.Raised, value: e as E };
    }
  }
}

class AndThen<A, E, ParentA, ParentE extends E> extends IOBase<A, E> {
  constructor(
    readonly parent: IO<ParentA, ParentE>,
    readonly next: (parentA: ParentA) => IO<A, E>
  ) {
    super();
  }

  async run(): Promise<A> {
    // TODO attempt to find a way to implement this function
    //      with type safety.

    let io: IO<A, E> = this;

    // Trampoline the andThen operation to ensure stack safety.
    while (io instanceof AndThen) {
      const { next, parent } = io as AndThen<any, any, any, any>;
      const parentA = await parent.run();
      io = next(parentA);
    }
    return io.run();
  }

  async runSafe(): Promise<IOResult<A, E>> {
    // TODO attempt to find a way to implement this function
    //      with type safety.

    let io: IO<A, E> = this;

    // Trampoline the andThen operation to ensure stack safety.
    while (io instanceof AndThen) {
      const { next, parent } = io as AndThen<any, any, any, any>;
      const result = await parent.runSafe();
      if (result.outcome === IOOutcome.Succeeded) {
        io = next(result.value);
      } else {
        return result;
      }
    }
    return io.runSafe();
  }
}

class Raise<A, E> extends IOBase<A, E> {
  constructor(private readonly error: E) {
    super();
  }

  async run(): Promise<never> {
    throw this.error;
  }

  async runSafe(): Promise<IOResult<A, E>> {
    return { outcome: IOOutcome.Raised, value: this.error };
  }
}

class Catch<A, E, ParentA extends A, CaughtA extends A, ParentE> extends IOBase<
  A,
  E
> {
  constructor(
    readonly parent: IO<ParentA, ParentE>,
    private readonly catcher: (parentE: ParentE) => IO<CaughtA, E>
  ) {
    super();
  }

  async runSafe(): Promise<IOResult<A, E>> {
    const parentResult = await this.parent.runSafe();
    if (parentResult.outcome === IOOutcome.Succeeded) {
      return parentResult;
    } else {
      const catcher = this.catcher;
      return catcher(parentResult.value).runSafe();
    }
  }
}

function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(effect);
}

function wrap<A>(value: A): IO<A, never> {
  return new Wrap(value);
}

function raise<E>(error: E): IO<never, E> {
  return new Raise(error);
}

// TODO rename this function?
function lift<Args extends unknown[], Return>(
  func: (...args: Args) => Promise<Return> | Return
): (...args: Args) => IO<Return> {
  return (...args) => IO(() => func(...args));
}

type IOArray = readonly IO<unknown, unknown>[];

type ExtractError<Action extends IO<unknown, unknown>> = Action extends IO<
  unknown,
  infer E
>
  ? E
  : never;
type ExtractValue<Action> = Action extends IO<infer A, unknown> ? A : never;

type UnionOfValues<Actions extends IOArray> = ExtractValue<Actions[number]>;
type UnionOfErrors<Actions extends IOArray> = ExtractError<Actions[number]>;

type ValuesArray<Actions extends IOArray> = {
  [I in keyof Actions]: ExtractValue<Actions[I]>;
};

/**
 * Creates an IO from an array of IOs, which will perform
 * the actions sequentially, returning an array of the results,
 * or stopping on the first error encountered.
 */
function sequence<Actions extends IOArray>(
  actions: Actions
): IO<ValuesArray<Actions>, UnionOfErrors<Actions>> {
  return sequenceFrom(actions, 0, [] as const);
}

function sequenceFrom<Actions extends IOArray>(
  actions: Actions,
  index: number,
  results: readonly unknown[]
): IO<ValuesArray<Actions>, UnionOfErrors<Actions>> {
  // TODO find a more type-safe way to express this function.

  if (index >= actions.length) {
    return IO.wrap(results as ValuesArray<Actions>);
  } else {
    const action = actions[index] as IO<unknown, UnionOfErrors<Actions>>;
    return action.andThen((result) =>
      sequenceFrom(actions, index + 1, results.concat([result]))
    );
  }
}

/**
 * Creates an IO from an array of IOs, which will perform
 * the actions concurrently, returning an array of the results,
 * or stopping when the first error occurs.
 */
function parallel<Actions extends IOArray>(
  actions: Actions
): IO<ValuesArray<Actions>, UnionOfErrors<Actions>> {
  return IO(
    () =>
      new Promise<Array<IOResult<unknown, unknown>>>((resolve, reject) => {
        if (actions.length === 0) {
          resolve([]);
        }

        // As each action completes, it writes its result to the corresponding
        // index in this array.
        const safeResults = Array<IOResult<unknown, unknown>>(actions.length);
        // This count is used to determine when all actions have completed.
        let resolvedCount = 0;

        for (let i = 0; i < actions.length; i++) {
          actions[i].runSafe().then((safeResult) => {
            safeResults[i] = safeResult;
            resolvedCount += 1;
            if (
              safeResult.outcome === IOOutcome.Raised ||
              resolvedCount === actions.length
            ) {
              // Either all actions have completed successfully, or one of
              // them has raised, so we resolve the promise.

              // eventually it should cancel the outstanding actions here.
              resolve(safeResults);
            }
          }, reject);
        }
      })
  )
    .catch(
      (unsoundlyThrownError): IO<never, never> => {
        // The promise above never intentionally rejects, so an error
        // here means an error was thrown outside of the IO system.
        throw unsoundlyThrownError;
      }
    )
    .andThen((safeResults) => {
      const succeeded = [];
      for (const safeResult of safeResults) {
        if (safeResult !== undefined) {
          if (safeResult.outcome === IOOutcome.Succeeded) {
            succeeded.push(safeResult.value);
          } else {
            return IO.raise(safeResult.value as UnionOfErrors<Actions>);
          }
        }
      }
      return IO.wrap((succeeded as unknown) as ValuesArray<Actions>);
    });
}

/**
 * Creates an IO from an array of IOs, which will perform
 * the actions concurrently, returning the earliest successful result
 * or stopping when the first error occurs.
 */
function race<Actions extends IOArray>(
  actions: Actions
): IO<
  UnionOfValues<Actions>,
  | UnionOfErrors<Actions>
  | (Actions extends { [0]: unknown } ? never : TypeError)
> {
  // The type signature for this function is a little scary. That is mainly to
  // represent accurately the fact that it will never raise this TypeError if
  // the array of actions is provably non-empty.
  if (actions.length === 0) {
    return IO.raise(TypeError("Cannot race an empty array of actions")) as IO<
      never,
      Actions extends { [0]: unknown } ? never : TypeError
    >;
  }
  return IO(
    () =>
      new Promise<IOResult<UnionOfValues<Actions>, UnionOfErrors<Actions>>>(
        (resolve, reject) => {
          for (let i = 0; i < actions.length; i++) {
            (actions[i] as IO<UnionOfValues<Actions>, UnionOfErrors<Actions>>)
              .runSafe()
              .then(resolve, reject);
          }
        }
      )
  )
    .catch(
      (unsoundlyThrownError): IO<never, never> => {
        // The promise above never intentionally rejects, so an error
        // here means an error was thrown outside of the IO system.
        throw unsoundlyThrownError;
      }
    )
    .andThen((safeResult) =>
      safeResult.outcome === IOOutcome.Succeeded
        ? IO.wrap(safeResult.value)
        : IO.raise(safeResult.value)
    );
}

const TIME_UNIT_FACTORS = {
  millisecond: 1,
  milliseconds: 1,
  seconds: 1000,
  second: 1000,
  minute: 60000,
  minutes: 60000,
  hour: 3600000,
  hours: 3600000,
};

type TimeUnits = keyof typeof TIME_UNIT_FACTORS;
type Duration = readonly [number, TimeUnits];

function wait(time: number, units: TimeUnits): IO<void, never> {
  const milliseconds = time * TIME_UNIT_FACTORS[units];
  return IO(
    () => new Promise((resolve) => IO._setTimeout(resolve, milliseconds))
  ) as IO<void, never>;
}

IO.wrap = wrap;
IO.raise = raise;
IO.lift = lift;
IO.void = IO.wrap<void>(undefined);
IO.sequence = sequence;
IO.parallel = parallel;
IO.race = race;
IO.wait = wait;

// This alias for setTimeout is used instead of calling the
// global directly, so it can be replaced with intercepting
// implementations in tests.
IO._setTimeout = setTimeout;

export default IO;
