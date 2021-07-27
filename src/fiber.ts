import { IO, IOResult } from "./io";

const TRACE_FIBERS = false;

export class Fiber<A = unknown, E = unknown> {
  // Assign each fiber a unique ID for debugging.
  private static nextId = 0;
  id = Fiber.nextId++;

  private cancelCurrentEffect = () => {};
  private readonly promise: Promise<IOResult<A, E>>;

  constructor(action: IO<A, E>) {
    if (TRACE_FIBERS) console.log(`starting fiber ${this.id}`);
    this.promise = this._execute(action);
  }

  static start<A, E>(action: IO<A, E>): IO<Fiber<A, E>, never> {
    return IO(() => new Fiber(action)).castError<never>();
  }

  async _execute<A2, E2>(action: IO<A2, E2>): Promise<IOResult<A2, E2>> {
    // Horrible type-cast needed to call the private executeOn method.
    return (action as any).executeOn(this);
  }

  outcome(): IO<IOResult<A, E>, never> {
    return IO(() => this.promise).catch((unsoundlyThrownError) => {
      throw unsoundlyThrownError;
    });
  }

  cancel(): IO<void, never> {
    return IO(() => {
      if (TRACE_FIBERS) console.log(`canceling fiber ${this.id}`);
      this.cancelCurrentEffect();
    }).catch((unsoundlyThrownError) => {
      throw unsoundlyThrownError;
    });
  }
}
