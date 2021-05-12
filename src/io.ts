type IO<A, E = unknown> =
  | Wrap<A, E>
  | Defer<A, E>
  | AndThen<A, E, any, E>
  | Raise<A, E>;

interface IOInterface<A, E = unknown> {
  map<B>(mapping: (a: A) => B): IO<B, E>;
  andThen<B, E2>(next: (a: A) => IO<B, E2>): IO<B, E | E2>;
  run(): Promise<A>;
}

class Wrap<A, E> implements IOInterface<A, E> {
  constructor(private readonly value: A) {}

  async run(): Promise<A> {
    return this.value;
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen(this, next);
  }

  map = map;
}

class Defer<A, E> implements IOInterface<A, E> {
  constructor(private readonly effect: () => Promise<A> | A) {}

  async run(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen(this, next);
  }

  map = map;
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

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen<B, E | E2, A, E>(this, next);
  }

  map = map;
}

class Raise<A, E> implements IOInterface<A, E> {
  constructor(private readonly error: E) {}

  async run(): Promise<never> {
    throw this.error;
  }

  andThen<B, E2 = never>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return (this as unknown) as IO<B, E>;
  }

  map = map;
}

function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(effect);
}

function map<A, B, E>(this: IO<A, E>, mapping: (a: A) => B): IO<B, E> {
  return this.andThen((a) => IO.wrap(mapping(a)));
}

function wrap<A>(value: A): IO<A, never> {
  return new Wrap(value);
}

function raise<E>(error: E): IO<never, E> {
  return new Raise(error);
}

function lift<Args extends unknown[], Return>(
  func: (...args: Args) => Promise<Return> | Return
): (...args: Args) => IO<Return> {
  return (...args) => IO(() => func(...args));
}

IO.wrap = wrap;
IO.raise = raise;
IO.lift = lift;
IO.void = IO.wrap(undefined);

export default IO;
