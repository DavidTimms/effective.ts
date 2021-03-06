# effective.ts

A library for writing safe, concurrent, fault-tolerant programs in TypeScript.

## Key Features

- **Functional design**  
  Effective.ts introduces an `IO` monad, as used in [Haskell](https://en.wikibooks.org/wiki/Haskell/Understanding_monads/IO) and [Cats Effect (Scala)](https://typelevel.org/cats-effect/). This allows the manipulation of programs as values, using pure functions. This has a "fluent" method chaining interface, to make it idiomatic to TypeScript.

- **Typed errors**  
  The `IO` type tracks the possible errors which can be raised by an action, so you know exactly which error cases you need to handle. No nasty surprises!

- **Concurrency and cancellation**  
  Launch lightweight async fibers (green threads), with support for early cancellation. Easily run actions in parallel or in sequence.

- **Fault-tolerance**  
  In the real world, things fail, so effective.ts has built-in support for timeouts and retries with exponential backoff.

## API Reference

[API reference documentation is hosted here.](https://davidtimms.github.io/effective.ts/modules/io.html)

## Cheat Sheet

If you are already familiar with using the IO types in Haskell or Scala, [this cheat sheet should help you get up to speed with Effective.ts quickly.](https://github.com/DavidTimms/effective.ts/blob/main/cheatsheet.md)
