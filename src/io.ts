enum IOType {
  Wrap,
  Defer,
  AndThen,
  Raise,
}

type IO<A, E = unknown> =
  | Wrap<A, E>
  | Defer<A, E>
  | AndThen<any, A, E, E>
  | Raise<E>;

interface IOInterface<A, E> {
  type: IOType;

  andThen<B, E2>(next: (a: A) => IO<B, E2>): IO<B, E | E2>;

  run(): Promise<A>;
}

class Wrap<A, E> implements IOInterface<A, E> {
  readonly type = IOType.Wrap;

  constructor(private readonly value: A) {}

  async run(): Promise<A> {
    return this.value;
  }

  andThen<B, E2>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen(this, next);
  }
}

class Defer<A, E> implements IOInterface<A, E> {
  readonly type = IOType.Defer;

  constructor(private readonly effect: () => Promise<A> | A) {}

  async run(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  andThen<B, E2>(next: (a: A) => IO<B, E2>): IO<B, E | E2> {
    return new AndThen(this, next);
  }
}

class AndThen<A, B, E1, E2> implements IOInterface<B, E1 | E2> {
  readonly type = IOType.AndThen;

  constructor(readonly parent: IO<A, E1>, readonly next: (a: A) => IO<B, E2>) {}

  async run(): Promise<B> {
    let io: IO<any, any> = this;

    // Trampoline the andThen operation to ensure stack safety
    while (io.type === IOType.AndThen) {
      const { next, parent }: { next: any; parent: any } = io;
      const a = await parent.run();
      io = next(a);
    }
    return io.run();
  }

  andThen<C, E2>(next: (a: B) => IO<C, E2>): IO<C, E1 | E2> {
    return new AndThen(this, next);
  }
}

class Raise<E> implements IOInterface<never, E> {
  readonly type = IOType.Raise;

  constructor(private readonly error: E) {}

  async run(): Promise<never> {
    throw this.error;
  }

  andThen(): IO<never, E> {
    return this;
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
