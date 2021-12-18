import { CancellationError, TimeoutError } from "./errors";
import { Fiber } from "./fiber";
import { Ref } from "./ref";

export { CancellationError, TimeoutError, Fiber, Ref };

/**
 * This is the primary type in the library. It represents an action
 * which returns a value of type `A`, or raises an error of type `E`.
 * The action may perform side effects and wait asynchronously. Any
 * asynchronous or impure function should return this type.
 *
 * @typeParam A - the type of values returned by this action.
 * @typeParam E - the type of errors raised by this action.
 */
export type IO<A, E = unknown> = IOBase<A, E>;

export enum OutcomeKind {
  Succeeded,
  Raised,
  Canceled,
}

/**
 * An object containing the result of running an action (IO). It
 * will either have succeeded with a value of type `A`, raise an
 * error of type `E`, or been canceled, in which case it will not
 * contain a value.
 *
 * @typeParam A - the type of values returned if the action succeeds.
 * @typeParam E - the type of errors raised if the action fails.
 */
export type Outcome<A, E> =
  | { kind: OutcomeKind.Succeeded; value: A }
  | { kind: OutcomeKind.Raised; value: E }
  | { kind: OutcomeKind.Canceled };

export const Outcome = {
  Succeeded<A>(value: A): Outcome<A, never> {
    return { kind: OutcomeKind.Succeeded, value };
  },
  Raised<E>(value: E): Outcome<never, E> {
    return { kind: OutcomeKind.Raised, value };
  },
  Canceled: { kind: OutcomeKind.Canceled } as const,

  toIO<A, E>(outcome: Outcome<A, E>): IO<A, E> {
    switch (outcome.kind) {
      case OutcomeKind.Succeeded:
        return IO.wrap(outcome.value);

      case OutcomeKind.Raised:
        return IO.raise(outcome.value);

      case OutcomeKind.Canceled:
        return IO.cancel();
    }
  },
};

/**
 * Options for controlling the behaviour of the [[`retry`]] method.
 */
export type RetryOptions<E = unknown> = {
  /** The number of times to retry. */
  count: number;

  /**
   * A predicate which will be called to decide whether a
   * raised error should be retried.
   **/
  filter?: (error: E) => boolean;

  /**
   * The time to wait after each failed attempt before retrying.
   */
  delay?: Duration;

  /**
   * The factor to multiply the delay by after each failed attempt.
   */
  backoff?: number;
};

export const RetryOptions: {
  defaults: Omit<Required<RetryOptions>, "count">;
} = {
  defaults: {
    filter: () => true,
    delay: [0, "milliseconds"],
    backoff: 1,
  },
};

export abstract class IOBase<A, E = unknown> {
  protected abstract executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>>;

  /**
   * Run this action, performing any side-effects, and return an object
   * representing the outcome. If the action raises an error or cancels,
   * the returned promise will still resolve. If you want to throw errors,
   * use [[`run`]] instead.
   *
   * You should ideally only call this once at the top level of your
   * program, or when frameworks need to interoperate with code using
   * [[`IO`]].
   */
  async runSafe(this: IO<A, E>): Promise<Outcome<A, E>> {
    return new Fiber(this)["promise"];
  }

  /**
   * Run this action, performing any side-effects, and return the result.
   * If the action raises an error, it is thrown. It the action cancels,
   * a [[`CancellationError`]] is thrown.
   *
   * You should ideally only call this once at the top level of your
   * program, or when frameworks need to interoperate with code using
   * [[`IO`]].
   */
  async run(this: IO<A, E>): Promise<A> {
    const outcome = await this.runSafe();

    switch (outcome.kind) {
      case OutcomeKind.Succeeded:
        return outcome.value;

      case OutcomeKind.Raised:
        throw outcome.value;

      case OutcomeKind.Canceled:
        throw new CancellationError();
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

  through<B, E2>(this: IO<A, E>, next: (a: A) => IO<B, E2>): IO<A, E | E2> {
    return this.andThen((a) => next(a).as(a));
  }

  onCancel<E2>(
    this: IO<A, E>,
    cancellationHandler: IO<unknown, E2>
  ): IO<A, E | E2> {
    return new OnCancel(this, cancellationHandler);
  }

  as<B>(this: IO<A, E>, value: B): IO<B, E> {
    const wrappedValue = IO.wrap(value);
    return this.andThen(() => wrappedValue);
  }

  get void(): IO<void, E> {
    return this.as(void 0);
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
    const raiseTimeout = IO.raise(new TimeoutError()).delay(time, units);

    return Fiber.start(raiseTimeout).andThen((timeoutFiber) =>
      IO.race([
        this.onCancel(timeoutFiber.cancel()),
        timeoutFiber.outcome().andThen(Outcome.toIO),
      ])
    );
  }

  /**
   * Re-run the IO if it raises an error, up to the given number of times. By
   * default, the action is retried immediately. A [[`RetryOptions`]] object
   * may be provided for more advanced use cases, such as exponential backoff.
   * A filter function can be used to only retry certain types of error.
   *
   * ### Examples
   * ```ts
   * const action = IO(() => fs.promises.readFile("./readme.md"));
   *
   * // Retry once if the first attempt fails.
   * action.retry(1);
   *
   * // Retry 3 times, after 1 second, then 2 seconds, then 4 seconds.
   * action.retry({
   *   count: 3,
   *   delay: [1, 'second'],
   *   backoff: 2,
   * });
   *
   * // Retry only if the file does not exist.
   * action.retry({
   *   count: 1,
   *   filter: (error: any) => error.code === 'ENOENT'
   * });
   * ```
   **/
  retry(this: IO<A, E>, retryCount: number): IO<A, E>;
  retry(this: IO<A, E>, options: RetryOptions<E>): IO<A, E>;
  retry(this: IO<A, E>, countOrOptions: number | RetryOptions<E>): IO<A, E> {
    const options: Required<RetryOptions<E>> =
      typeof countOrOptions === "number"
        ? { count: countOrOptions, ...RetryOptions.defaults }
        : { ...RetryOptions.defaults, ...countOrOptions };

    const nextAttempt = (attemptNumber: number): IO<A, E> => {
      if (attemptNumber >= options.count) {
        return this;
      } else {
        return this.catch((error) => {
          // Calculate the delay before the next attempt using exponential backoff.
          const [initialDelayMs, delayUnits] = options.delay;
          const nextDelayMs = initialDelayMs * options.backoff ** attemptNumber;

          return options.filter(error)
            ? nextAttempt(attemptNumber + 1).delay(nextDelayMs, delayUnits)
            : IO.raise(error);
        });
      }
    };

    return nextAttempt(0);
  }

  /**
   * This method type-casts any errors raised by this IO to the given type.
   * This can easily cause type unsoundness problems, so use with care.
   */
  castError<CastedError>(): IO<A, CastedError> {
    return (this as unknown) as IO<A, CastedError>;
  }
}

class Wrap<A, E> extends IOBase<A, E> {
  constructor(private readonly value: A) {
    super();
  }

  protected async executeOn(): Promise<Outcome<A, E>> {
    return Outcome.Succeeded(this.value);
  }
}

class Defer<A, E> extends IOBase<A, E> {
  constructor(
    private readonly effect: () => {
      promise: Promise<A>;
      cancel: (() => void) | null;
    }
  ) {
    super();
  }

  protected async executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>> {
    const effect = this.effect;

    return new Promise(async (resolve) => {
      const previousCancelCurrentEffect = fiber["cancelCurrentEffect"];
      try {
        const { promise, cancel } = effect();
        fiber["cancelCurrentEffect"] = () => {
          try {
            if (cancel) cancel();
            previousCancelCurrentEffect();
          } catch (e) {
            // If the cancel function throws, the IO outcome is "raised"
            // instead of "canceled". This stops cancellation errors from
            // being silently ignored.
            resolve(Outcome.Raised(e as E));
          }
          resolve(Outcome.Canceled);
        };
        const value = await promise;
        fiber["cancelCurrentEffect"] = previousCancelCurrentEffect;
        resolve(Outcome.Succeeded(value));
      } catch (e: unknown) {
        fiber["cancelCurrentEffect"] = previousCancelCurrentEffect;
        resolve(Outcome.Raised(e as E));
      }
    });
  }
}

class AndThen<A, E, ParentA, ParentE extends E> extends IOBase<A, E> {
  constructor(
    readonly parent: IO<ParentA, ParentE>,
    readonly next: (parentA: ParentA) => IO<A, E>
  ) {
    super();
  }

  protected async executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>> {
    // TODO attempt to find a way to implement this function
    //      with type safety.

    let action: IO<A, E> = this;

    // Trampoline the andThen operation to ensure stack safety.
    while (action instanceof AndThen) {
      const { next, parent } = action as AndThen<any, any, any, any>;
      const outcome = await fiber._execute(parent);
      if (outcome.kind === OutcomeKind.Succeeded) {
        action = next(outcome.value);
      } else {
        return outcome;
      }
    }
    return fiber._execute(action);
  }
}

class Raise<A, E> extends IOBase<A, E> {
  constructor(private readonly error: E) {
    super();
  }

  protected async executeOn(): Promise<Outcome<A, E>> {
    return Outcome.Raised(this.error);
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

  protected async executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>> {
    const parentResult = await fiber._execute(this.parent);
    if (parentResult.kind === OutcomeKind.Raised) {
      const catcher = this.catcher;
      return fiber._execute(catcher(parentResult.value));
    } else {
      return parentResult;
    }
  }
}

class Cancel<A, E> extends IOBase<A, E> {
  protected async executeOn(): Promise<Outcome<A, E>> {
    return Outcome.Canceled;
  }
}

class OnCancel<A, E, ParentE extends E, HandlerE extends E> extends IOBase<
  A,
  E
> {
  constructor(
    readonly parent: IO<A, ParentE>,
    private readonly cancellationHandler: IO<unknown, HandlerE>
  ) {
    super();
  }

  protected async executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>> {
    const parentOutcome = await fiber._execute(this.parent);
    if (parentOutcome.kind === OutcomeKind.Canceled) {
      const handlerOutcome = await fiber._execute(this.cancellationHandler);

      if (handlerOutcome.kind === OutcomeKind.Raised) {
        return handlerOutcome;
      }
    }
    return parentOutcome;
  }
}

class Uncancelable<A, E> extends IOBase<A, E> {
  constructor(private readonly action: IO<A, E>) {
    super();
  }

  protected async executeOn(fiber: Fiber<A, E>): Promise<Outcome<A, E>> {
    const previousCancelCurrentEffect = fiber["cancelCurrentEffect"];
    let wasCanceled = false;

    try {
      // If this fiber is canceled, record that it was canceled, but
      // don't resolve until the action is completed.
      fiber["cancelCurrentEffect"] = () => {
        wasCanceled = true;
      };

      // Run the action on a separate fiber.
      const outcome = await this.action.runSafe();

      return wasCanceled ? Outcome.Canceled : outcome;
    } finally {
      fiber["cancelCurrentEffect"] = previousCancelCurrentEffect;
    }
  }
}

class Bracket<
  A,
  E,
  Resource,
  EOpen extends E,
  EClose extends E,
  EUse extends E
> extends IOBase<A, E> {
  constructor(
    private readonly open: IO<Resource, EOpen>,
    private readonly close: (a: Resource) => IO<unknown, EClose>,
    private readonly use: (a: Resource) => IO<A, EUse>
  ) {
    super();
  }

  protected async executeOn(
    fiber: Fiber
  ): Promise<Outcome<A, EOpen | EClose | EUse>> {
    const { open, close, use } = this;

    const openOutcome = await fiber._execute(open);

    if (openOutcome.kind === OutcomeKind.Succeeded) {
      const a = openOutcome.value;
      const useOutcome = await fiber._execute(use(a));
      const closeOutcome = await fiber._execute(close(a));

      if (closeOutcome.kind !== OutcomeKind.Succeeded) {
        return closeOutcome;
      } else {
        return useOutcome;
      }
    } else {
      return openOutcome;
    }
  }
}

export function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(() => ({
    promise: Promise.resolve(effect()),
    cancel: null,
  }));
}

function cancelable<A>(
  cancelableEffect: () => { promise: Promise<A>; cancel: () => void }
): IO<A, unknown> {
  return new Defer(cancelableEffect);
}

function uncancelable<A, E>(action: IO<A, E>): IO<A, E> {
  return new Uncancelable(action);
}

function wrap<A>(value: A): IO<A, never> {
  return new Wrap(value);
}

function raise<E>(error: E): IO<never, E> {
  return new Raise(error);
}

/**
 * Cancels the execution of the current fiber.
 */
function cancel(): IO<never, never> {
  return new Cancel<never, never>();
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
 * Creates a single action from an array of actions, which will perform
 * the actions sequentially, returning an array of the results, or
 * stopping on the first error encountered.
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
 * Creates a single from an array of actions, which will perform
 * the actions concurrently, returning an array of the results.
 * If any of the actions cancel or raise an error, all other
 * actions are immediately canceled.
 */
function parallel<Actions extends IOArray>(
  actions: Actions
): IO<ValuesArray<Actions>, UnionOfErrors<Actions>> {
  // Recursively starts each action on a separate fiber. The ref is used
  // to ensure that there can never be an orphaned fiber which is not
  // left running when the main parent fiber is canceled.
  function startNextActionFiber(
    previousFibers: Fiber[],
    index: number
  ): IO<Outcome<unknown, unknown>[], never> {
    if (index >= actions.length) {
      return startEarlyCancellationFibers(previousFibers);
    } else {
      return Ref.empty<Fiber>().andThen((fiberRef) =>
        IO.uncancelable(Fiber.start(actions[index]).through(fiberRef.set))
          .andThen((fiber) =>
            startNextActionFiber([...previousFibers, fiber], index + 1)
          )
          .onCancel(fiberRef.get.andThen((fiber) => fiber?.cancel() ?? IO.void))
      );
    }
  }

  // Creates a second fiber for each action which waits for the outcome
  // of the first, and cancels the other fibers if it raises or cancels.
  function startEarlyCancellationFibers(
    fibers: Fiber[]
  ): IO<Outcome<unknown, unknown>[], never> {
    return IO.sequence(
      fibers.map((fiber) =>
        Fiber.start(
          fiber
            .outcome()
            .through((outcome) =>
              outcome.kind === OutcomeKind.Succeeded
                ? IO.void
                : cancelAll(fibers)
            )
        )
      )
    )
      .andThen((cancellationFibers) =>
        IO.sequence(
          cancellationFibers.map((f) => f.outcome().andThen(Outcome.toIO))
        )
      )
      .onCancel(cancelAll(fibers));
  }

  return startNextActionFiber([], 0).andThen((outcomes) => {
    const succeededResults: unknown[] = [];

    for (const outcome of outcomes) {
      switch (outcome.kind) {
        case OutcomeKind.Succeeded:
          succeededResults.push(outcome.value);
          break;

        // If any of the actions raised an error, the overall action
        // raises.
        case OutcomeKind.Raised:
          return IO.raise(outcome.value as UnionOfErrors<Actions>);

        case OutcomeKind.Canceled:
          continue;
      }
    }

    if (succeededResults.length === actions.length) {
      return IO.wrap((succeededResults as unknown) as ValuesArray<Actions>);
    } else {
      // If we get here then all of the actions were cancelled, so
      // we cancel the calling fiber.
      return IO.cancel();
    }
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

  const typecastActions = actions as readonly IO<
    UnionOfValues<Actions>,
    UnionOfErrors<Actions>
  >[];

  // Recursively starts each action on a separate fiber. The ref is used
  // to ensure that there can never be an orphaned fiber which is not
  // left running when the main parent fiber is canceled.
  function startNextActionFiber(
    previousFibers: Fiber<UnionOfValues<Actions>, UnionOfErrors<Actions>>[],
    index: number
  ): IO<Fiber<UnionOfValues<Actions>, UnionOfErrors<Actions>>[], never> {
    if (index >= typecastActions.length) {
      return startEarlyCancellationFibers(previousFibers).as(previousFibers);
    } else {
      return Ref.empty<Fiber>().andThen((fiberRef) =>
        IO.uncancelable(
          Fiber.start(typecastActions[index]).through(fiberRef.set)
        )
          .andThen((fiber) =>
            startNextActionFiber([...previousFibers, fiber], index + 1)
          )
          .onCancel(fiberRef.get.andThen((fiber) => fiber?.cancel() ?? IO.void))
      );
    }
  }

  // Creates a second fiber for each action which waits for the outcome
  // of the first, and cancels the other fibers if it raises or succeeds.
  function startEarlyCancellationFibers(
    fibers: Fiber<UnionOfValues<Actions>, UnionOfErrors<Actions>>[]
  ): IO<Outcome<UnionOfValues<Actions>, UnionOfErrors<Actions>>[], never> {
    return IO.sequence(
      fibers.map((fiber) =>
        Fiber.start(
          fiber
            .outcome()
            .through((outcome) =>
              outcome === Outcome.Canceled ? IO.void : cancelAll(fibers)
            )
        )
      )
    )
      .andThen((cancellationFibers) =>
        IO.sequence(
          cancellationFibers.map((f) => f.outcome().andThen(Outcome.toIO))
        )
      )
      .onCancel(cancelAll(fibers));
  }

  return startNextActionFiber([], 0)
    .andThen(findFirstFinishedOutcome)
    .andThen(Outcome.toIO);
}

function cancelAll(fibers: Fiber<unknown, unknown>[]): IO<void, never> {
  if (fibers.length === 0) {
    return IO.void;
  } else {
    return fibers[0].cancel().andThen(() => cancelAll(fibers.slice(1)));
  }
}

function findFirstFinishedOutcome<A, E>(
  fibers: Fiber<A, E>[],
  index = 0
): IO<Outcome<A, E>, never> {
  if (index >= fibers.length) {
    return IO.cancel();
  }
  return fibers[index]
    .outcome()
    .andThen((outcome) =>
      outcome === Outcome.Canceled
        ? findFirstFinishedOutcome(fibers, index + 1)
        : IO.wrap(outcome)
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
  return IO.cancelable(() => {
    let handle: number | undefined = undefined;

    return {
      promise: new Promise((resolve) => {
        handle = IO._setTimeout(resolve, milliseconds);
      }),
      cancel: () => clearTimeout(handle),
    };
  }) as IO<void, never>;
}

/**
 * Creates a wrapper function which will use an `open` action to
 * acquire a resource and `close` action to release it. If the
 * `open` action succeeds, then the `close` function is guaranteed
 * to be called. This can be used where you might use a `try... finally`
 * block in imperative code, when a clean up action must always be
 * taken.
 */
const bracket = <Resource, EOpen, EClose>(
  open: IO<Resource, EOpen>,
  close: (r: Resource) => IO<unknown, EClose>
) => <A, EUse>(
  use: (r: Resource) => IO<A, EUse>
): IO<A, EOpen | EClose | EUse> => new Bracket(open, close, use);

IO.cancelable = cancelable;
IO.wrap = wrap;
IO.raise = raise;
IO.cancel = cancel;
IO.lift = lift;
IO.void = IO.wrap<void>(undefined);
IO.sequence = sequence;
IO.parallel = parallel;
IO.race = race;
IO.wait = wait;
IO.bracket = bracket;
IO.uncancelable = uncancelable;

/**
 * @hidden
 * This alias for setTimeout is used instead of calling the
 * global directly, so it can be replaced with intercepting
 * implementations in tests.
 */
IO._setTimeout = setTimeout;

export default IO;
