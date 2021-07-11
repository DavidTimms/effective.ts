import { IO, IOResult } from "./io";

export class Fiber<A, E> {
  private static nextId = 0;
  id = Fiber.nextId++;

  private cancelCurrentEffect: (() => void) | null = null;
  private isCanceled = false;
  private readonly promise: Promise<IOResult<A, E>>;

  constructor(action: IO<A, E>) {
    this.promise = this._execute(action);
  }

  static start<A, E>(action: IO<A, E>): IO<Fiber<A, E>, never> {
    return IO.wrap(new Fiber(action));
  }

  async _execute<A2, E2>(action: IO<A2, E2>): Promise<IOResult<A2, E2>> {
    // Horrible type-cast needed to call the private executeOn method.
    return (action as any).executeOn(this);
  }

  outcome(): IO<IOResult<A, E>, never> {
    return IO(() => this.promise).castError<never>();
  }

  cancel(): IO<void, never> {
    return IO(() => {
      this.isCanceled = true;
      if (this.cancelCurrentEffect) this.cancelCurrentEffect();
    }).castError<never>();
  }
}
