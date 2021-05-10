export default interface IO<A, E = Error> {
  map<B>(mapping: (a: A) => B): IO<B, E>;
  andThen<B>(next: (a: A) => IO<B, E>): IO<B, E>;
  run(): Promise<A>;
}

class Wrap<A, E = Error> implements IO<A, E> {
  constructor(private readonly value: A) {}

  async run(): Promise<A> {
    return this.value;
  }

  andThen<B>(next: (a: A) => IO<B, E>): IO<B, E> {
    return new AndThen(this, next);
  }

  map = map;
}

class Defer<A, E = Error> implements IO<A, E> {
  constructor(private readonly effect: () => Promise<A> | A) {}

  async run(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  andThen<B>(next: (a: A) => IO<B, E>): IO<B, E> {
    return new AndThen(this, next);
  }

  map = map;
}

class AndThen<A, B, E = Error> implements IO<B, E> {
  constructor(readonly parent: IO<A, E>, readonly next: (a: A) => IO<B, E>) {}

  async run(): Promise<B> {
    let io: IO<B, E> = this;

    // Trampoline the andThen operation to ensure stack safety
    while (io instanceof AndThen) {
      const { next, parent } = io;
      const a = await parent.run();
      io = next(a);
    }
    return io.run();
  }

  andThen<C>(next: (a: B) => IO<C, E>): IO<C, E> {
    return new AndThen(this, next);
  }

  map = map;
}

class Raise<E> implements IO<never, E> {
  constructor(private readonly error: E) {}

  async run(): Promise<never> {
    throw this.error;
  }

  andThen(): IO<never, E> {
    return this;
  }

  map = map;
}

export default function IO<A>(effect: () => Promise<A> | A): IO<A, unknown> {
  return new Defer(effect);
}

function map<A, B, E>(this: IO<A, E>, mapping: (a: A) => B): IO<B, E> {
  return this.andThen((a) => IO.wrap(mapping(a)));
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
