import IO from "./io";

export class Ref<A> {
  constructor(private currentValue: A) {
    this.get = IO(() => this.currentValue).castError<never>();
    this.set = (newValue: A) =>
      IO(() => {
        this.currentValue = newValue;
      }).castError<never>();
  }

  static create<A>(initialValue: A): IO<Ref<A>, never> {
    return IO(() => new Ref(initialValue)).castError<never>();
  }

  static empty<A>(): IO<Ref<A | null>, never> {
    return Ref.create<A | null>(null);
  }

  get: IO<A, never>;
  set: (newValue: A) => IO<void, never>;
}
