enum IOType {
  Wrap,
  Defer,
  AndThen,
  Raise,
}

export default interface IO<A, E = Error> {
  type: IOType;

  andThen<B>(nextIo: (a: A) => IO<B, E>): IO<B, E>;

  run(): Promise<A>;
}

class Wrap<A, E = Error> implements IO<A, E> {
  readonly type = IOType.Wrap;

  constructor(private readonly value: A) {}

  async run(): Promise<A> {
    return this.value;
  }

  andThen<B>(nextIo: (a: A) => IO<B, E>): IO<B, E> {
    return new AndThen(this, nextIo);
  }
}

class Defer<A, E = Error> implements IO<A, E> {
  readonly type = IOType.Defer;

  constructor(private readonly effect: () => Promise<A> | A) {}

  async run(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  andThen<B>(nextIo: (a: A) => IO<B, E>): IO<B, E> {
    return new AndThen(this, nextIo);
  }
}

class AndThen<A, B, E = Error> implements IO<B, E> {
  readonly type = IOType.AndThen;

  constructor(readonly io: IO<A, E>, readonly nextIo: (a: A) => IO<B, E>) {}

  async run(): Promise<B> {
    let io: IO<B, E> = this;

    // Trampoline the andThen operation to ensure stack safety
    while (io.type === IOType.AndThen) {
      const { nextIo, io: parent } = io as AndThen<A, B, E>;
      const a = await parent.run();
      io = nextIo(a);
    }
    return io.run();
  }

  andThen<C>(nextIo: (a: B) => IO<C, E>): IO<C, E> {
    return new AndThen(this, nextIo);
  }
}

class Raise<E> implements IO<never, E> {
  readonly type = IOType.Raise;

  constructor(private readonly error: E) {}

  async run(): Promise<never> {
    throw this.error;
  }

  andThen(): IO<never, E> {
    return this;
  }
}

export default function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(effect);
}

function wrap<A, E = Error>(value: A): IO<A, E> {
  return new Wrap(value);
}

function raise<E = Error>(error: E): IO<never, E> {
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
