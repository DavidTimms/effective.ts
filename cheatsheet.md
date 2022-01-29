# Cheat Sheet

If you are already familiar with using the IO types in Haskell or Scala, this cheat sheet should help you get up to speed with Effective.ts quickly.

| Description                                                     | Effective.ts              | Haskell                         | Cats Effect (Scala)                 |
| --------------------------------------------------------------- | ------------------------- | ------------------------------- | ----------------------------------- |
| Run an action (not pure)                                        | `a.run()`                 | `unsafePerformIO a`             | `.a.unsafeRunSync()`                |
| Defer an effect                                                 | `IO(() => f())`           |                                 | `IO(f())`                           |
| Wrap a pure value in IO                                         | `IO.wrap(v)`              | `return v`                      | `IO.pure(v)`                        |
| Raise an error                                                  | `IO.raise(e)`             | `ioError e`                     | `IO.raiseError(e)`                  |
| Succeed with no result                                          | `IO.void`                 | `return ()`                     | `IO.unit`                           |
| Sequence two dependent actions, giving the result of the second | `a.andThen(b)`            | `a >>= b`                       | `a.flatMap(b)`                      |
| Sequence two dependent actions, giving the result of the first  | `a.through(b)`            | `a >>= \x -> b x <$ x`          | `a.flatTap(b)`                      |
| Replace the result of an action                                 | `a.as(v)`                 | `a <$ v`                        | `a.as(v)`                           |
| Transform the result of an action                               | `a.map(f)`                | `fmap f a`                      | `a.map(f)`                          |
| Catch a raised error                                            | `a.catch(e => handle(e))` | `catchIOError a \e -> handle e` | `a.handleErrorWith(e => handle(e))` |
| Transform a raised error                                        | `a.mapError(f)`           | `modifyIOError f a`             | `a.adaptError(f)`                   |
| Pause execution for 1 second                                    | `IO.wait(1, "second")`    | `threadDelay 1000000`           | `IO.sleep(1.seconds)`               |
| Cancel the current fiber                                        | `IO.cancel()`             |                                 | `IO.canceled`                       |
| Combine two independent actions in parallel                     | `IO.parallel([a, b])`     | `concurrently a b`              | `(a, b).parTupled`                  |
| Combine two independent actions in series                       | `a.andThen(() => b)`      | `a *> b`                        | `a *> b`                            |
| Race two actions against each other                             | `IO.race([a, b])`         | `race a b`                      | `IO.race(a, b)`                     |

<!---

Start a action on a new fiber

Block until a fiber finishes

Cancel a fiber

Make a action uncancelable

Perform an action if the action is cancelled

-->
