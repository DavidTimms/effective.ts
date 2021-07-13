### Core

- [x] add tests (property-based tests for monad laws?)
- [x] change then method to flatMap
- [x] support async
- [x] catch method
- [x] correct type restrictions on errors
- [x] sequence and parallel functions
- [x] race function
- [ ] finally method

# Async, Concurrency & Fault Tolerance

- [x] wait function e.g. `.andThen(IO.wait(5, "seconds"))`
- [x] timeout method (implement in terms of `IO.race`?)
- [x] retry method
- [x] exponential backoff for retry
- [x] filter for retry

# Cancellation & Fibers

- [x] Add Canceled to IOOutcome
- [x] Add cancellation behaviour to run loop
- [ ] Add a way to interoperate with other cancellation mechanisms e.g. `clearTimeout`
- [ ] Support async `cancel` callbacks for `IO.cancelable`
- [x] Fiber.start function
- [x] Fiber.cancel method
- [x] Fiber.outcome method
- [ ] Rewrite `parallel` and `race` using fibers
- [x] IO.cancel function for a fiber to self-cancel
- [ ] `IO.onCancel` method for resource cleanup (do we need a full-blown bracket/resource construct?)

# Performance & Internals

- [x] make recursive IO stack-safe
- [ ] optimise to avoid creation of unnecessary promises
- [ ] write some useful benchmarks - compare async/await/throw implementation to IO
- [ ] Re-use the `Wrap`, `Raise` and `Cancel` class as the cases of `IOResult` to avoid allocations?

# Code Organisation

- [ ] work out how to split into several modules
- [x] replace `IOInterface` and `methods` object with abstract base class
- [ ] Use consistent terminology throughout - e.g. IO vs action vs effect

### Ergonomics Improvements

- [x] lift function to return IO
- [x] map method
- [x] mapError method
- [ ] forEach method (and parallel equivalent)
- [x] `.as` method
- [x] repeatForever method
- [ ] some more helper methods for composing independent IOs and returning the first or second value
- [ ] overload `andThen` to take an `IO` instead of a `() => IO`
- [ ] Support for partial functions in catch and andThen?
