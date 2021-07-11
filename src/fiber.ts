import { IO, IOResult } from "./io";

export class Fiber<A, E> {
  private readonly promise: Promise<IOResult<A, E>>;

  constructor(action: IO<A, E>) {
    // Horrible type-cast needed to call the private executeOn method.
    this.promise = (action as any).executeOn(this);
  }

  static start<A, E>(action: IO<A, E>): IO<Fiber<A, E>, never> {
    return IO.wrap(new Fiber(action));
  }

  outcome(): IO<IOResult<A, E>, never> {
    return IO(() => this.promise).castError<never>();
  }
}
