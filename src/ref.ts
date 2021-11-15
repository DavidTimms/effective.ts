import IO from "./io";

export class Ref<A> {
  constructor(private currentValue: A) {
    this.get = IO(() => this.currentValue).castError<never>();

    this.set = (newValue: A) =>
      IO(() => {
        this.currentValue = newValue;
      }).castError<never>();

    this.modify = (modifier) =>
      IO(() => {
        this.currentValue = modifier(this.currentValue);
        return this.currentValue;
      }).castError<never>();
  }

  static create<A>(initialValue: A): IO<Ref<A>, never> {
    return IO(() => new Ref(initialValue)).castError<never>();
  }

  static empty<A>(): IO<Ref<A | null>, never> {
    return Ref.create<A | null>(null);
  }

  static get<A>(ref: Ref<A>): IO<A, never> {
    return ref.get;
  }

  static set<A>(newValue: A): (ref: Ref<A>) => IO<void, never> {
    return (ref) => ref.set(newValue);
  }

  static modify<A>(
    modifier: (currentValue: A) => A
  ): (ref: Ref<A>) => IO<A, never> {
    return (ref) => ref.modify(modifier);
  }

  get: IO<A, never>;
  set: (newValue: A) => IO<void, never>;
  modify: (modifier: (currentValue: A) => A) => IO<A, never>;
}
