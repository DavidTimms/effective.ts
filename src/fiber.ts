import { IO, IOResult } from "./io";

export class Fiber<A, E> {
  private readonly promise: Promise<IOResult<A, E>>;

  constructor(action: IO<A, E>) {
    this.promise = action.runSafe();
  }

  static start<A, E>(action: IO<A, E>): IO<Fiber<A, E>, never> {
    return IO.wrap(new Fiber(action));
  }

  outcome(): IO<IOResult<A, E>, never> {
    return IO(() => this.promise).castError<never>();
  }
}
