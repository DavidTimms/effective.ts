enum IOType {
  Wrap,
  Defer,
  FlatMap,
  Raise,
}

export default interface IO<A, E = Error> {
  type: IOType;

  flatMap<B>(nextIo: (a: A) => IO<B, E>): IO<B, E>;

  unsafeRun(): Promise<A>;
}

class Wrap<A, E = Error> implements IO<A, E> {
  readonly type = IOType.Wrap;

  constructor(private readonly value: A) {}

  async unsafeRun(): Promise<A> {
    return this.value;
  }

  flatMap<B>(nextIo: (a: A) => IO<B, E>): IO<B, E> {
    return new FlatMap(this, nextIo);
  }
}

class Defer<A, E = Error> implements IO<A, E> {
  readonly type = IOType.Defer;

  constructor(private readonly effect: () => Promise<A> | A) {}

  async unsafeRun(): Promise<A> {
    const effect = this.effect;
    return effect();
  }

  flatMap<B>(nextIo: (a: A) => IO<B, E>): IO<B, E> {
    return new FlatMap(this, nextIo);
  }
}

class FlatMap<A, B, E = Error> implements IO<B, E> {
  readonly type = IOType.FlatMap;

  constructor(readonly io: IO<A, E>, readonly nextIo: (a: A) => IO<B, E>) {}

  async unsafeRun(): Promise<B> {
    return unsafeRun(this);
  }

  flatMap<C>(nextIo: (a: B) => IO<C, E>): IO<C, E> {
    return new FlatMap(this, nextIo);
  }
}

class Raise<E> implements IO<never, E> {
  readonly type = IOType.Raise;

  constructor(private readonly error: E) {}

  async unsafeRun(): Promise<never> {
    throw this.error;
  }

  flatMap(): IO<never, E> {
    return this;
  }
}

async function unsafeRun<A, B, E>(io: IO<B, E>): Promise<B> {
  // Trampoline the flatMap operation to ensure stack safety
  while (io.type === IOType.FlatMap) {
    const { nextIo, io: parent } = io as FlatMap<A, B, E>;
    const a = await unsafeRun(parent);
    io = nextIo(a);
  }
  return io.unsafeRun();
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
