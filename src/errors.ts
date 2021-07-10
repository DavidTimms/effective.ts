export class TimeoutError extends Error {
  constructor() {
    super("Time limit exceeded");
  }
}

export class CancellationError extends Error {
  constructor() {
    super("Execution of this fiber was canceled");
  }
}
