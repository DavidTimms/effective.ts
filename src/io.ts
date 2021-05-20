type IO<A, E = unknown> =
  | Wrap<A, E>
  | Defer<A, E>
  | AndThen<A, E, any, E>
  | Raise<A, E>
  | Catch<A, E, any, any, any>;

enum IOOutcome {
  Succeeded,
  Raised,
}

type IOResult<A, E> =
  | { outcome: IOOutcome.Succeeded; value: A }
  | { outcome: IOOutcome.Raised; value: E };

interface IOInterface<A, E = unknown> {
  map<B>(mapping: (a: A) => B): IO<B, E>;
  andThen<B, E2>(next: (a: A) => IO<B, E2>): IO<B, E | E2>;
  mapError<E2>(mapping: (e: E) => E2): IO<A, E2>;
  catch<B, E2>(catcher: (e: E) => IO<B, E2>): IO<A | B, E2>;
  run(): Promise<A>;
  runSafe(): Promise<IOResult<A, E>>;
  repeatForever(): IO<never, E>;
}

class Wrap<A, E> implements IOInterface<A, E> {
  constructor(private readonly value: A) {}

  async run(): Promise<A> {
    return this.value;
  }

  async runSafe(): Promise<IOResult<A, E>> {
    return { outcome: IOOutcome.Succeeded, value: this.value };
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map = methods.map;
  mapError = methods.mapError;
  catch = methods.catch;
  repeatForever = methods.repeatForever;
}

class Defer<A, E> implements IOInterface<A, E> {
  constructor(private readonly effect: () => Promise<A> | A) {}

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

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map = methods.map;
  mapError = methods.mapError;
  catch = methods.catch;
  repeatForever = methods.repeatForever;
}

class AndThen<A, E, ParentA, ParentE extends E> implements IOInterface<A, E> {
  constructor(
    readonly parent: IO<ParentA, ParentE>,
    readonly next: (parentA: ParentA) => IO<A, E>
  ) {}

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
      }
    }
    return io.runSafe();
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map = methods.map;
  mapError = methods.mapError;
  catch = methods.catch;
  repeatForever = methods.repeatForever;
}

class Raise<A, E> implements IOInterface<A, E> {
  constructor(private readonly error: E) {}

  async run(): Promise<never> {
    throw this.error;
  }

  async runSafe(): Promise<IOResult<A, E>> {
    return { outcome: IOOutcome.Raised, value: this.error };
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return (this as unknown) as IO<B, E>;
  }

  map = methods.map;
  mapError = methods.mapError;
  catch = methods.catch;
  repeatForever = methods.repeatForever;
}

class Catch<A, E, ParentA extends A, CaughtA extends A, ParentE>
  implements IOInterface<A, E> {
  constructor(
    readonly parent: IO<ParentA, ParentE>,
    private readonly catcher: (parentE: ParentE) => IO<CaughtA, E>
  ) {}

  async run(): Promise<A> {
    const result = await this.runSafe();
    if (result.outcome === IOOutcome.Succeeded) {
      return result.value;
    } else {
      throw result.value;
    }
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

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map = methods.map;
  mapError = methods.mapError;
  catch = methods.catch;
  repeatForever = methods.repeatForever;
}

function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(effect);
}

const methods = {
  map<A, B, E>(this: IO<A, E>, mapping: (a: A) => B): IO<B, E> {
    return this.andThen((a) => IO.wrap(mapping(a)));
  },

  mapError<A, E, E2>(this: IO<A, E>, mapping: (e: E) => E2): IO<A, E2> {
    return this.catch((e) => IO.raise(mapping(e)));
  },

  catch<ParentA, ParentE, CaughtA, CaughtE>(
    this: IO<ParentA, ParentE>,
    catcher: (e: ParentE) => IO<CaughtA, CaughtE>
  ): IO<ParentA | CaughtA, CaughtE> {
    return new Catch(this, catcher);
  },

  repeatForever<A, E>(this: IO<A, E>): IO<never, E> {
    return this.andThen(() => this.repeatForever());
  },
};

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

type UnionOfErrors<Actions extends IOArray> = ExtractError<Actions[number]>;

type ExtractResult<Action> = Action extends IO<infer A, unknown> ? A : never;

type ResultsArray<Actions extends IOArray> = {
  [I in keyof Actions]: ExtractResult<Actions[I]>;
};

/**
 * Creates an IO from an array of IOs, which will perform
 * the actions sequentially, returning an array of the results,
 * or stopping on the first error encountered.
 */
function sequence<Actions extends IOArray>(
  actions: Actions
): IO<ResultsArray<Actions>, UnionOfErrors<Actions>> {
  return sequenceFrom(actions, 0, [] as const);
}

function sequenceFrom<Actions extends IOArray>(
  actions: Actions,
  index: number,
  results: readonly unknown[]
): IO<ResultsArray<Actions>, UnionOfErrors<Actions>> {
  // TODO find a more type-safe way to express this function.

  if (index >= actions.length) {
    return IO.wrap(results as ResultsArray<Actions>);
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
): IO<ResultsArray<Actions>, UnionOfErrors<Actions>> {
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
      return IO.wrap((succeeded as unknown) as ResultsArray<Actions>);
    });
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

function wait(time: number, units: TimeUnits): IO<void> {
  const milliseconds = time * TIME_UNIT_FACTORS[units];
  return IO(() => new Promise((resolve) => setTimeout(resolve, milliseconds)));
}

IO.wrap = wrap;
IO.raise = raise;
IO.lift = lift;
IO.void = IO.wrap<void>(undefined);
IO.sequence = sequence;
IO.parallel = parallel;
IO.wait = wait;

export default IO;
