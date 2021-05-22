export class TimeoutError extends Error {
  constructor() {
    super("Time limit exceeded");
  }
}
