### Core

- [x] add tests (property-based tests for monad laws?)
- [x] change then method to flatMap
- [x] support async
- [x] catch method
- [x] correct type restrictions on errors
- [x] sequence and parallel functions
- [x] race function

# Async, Concurrency & Fault Tolerance

- [x] wait function e.g. `.andThen(IO.wait(5, "seconds"))`
- [x] timeout method (implement in terms of `IO.race`?)
- [x] retry method
- [x] exponential backoff for retry
- [x] filter for retry
- [ ] cancellation
- [ ] fibers

# Performance & Internals

- [x] make recursive IO stack-safe
- [ ] optimise to avoid creation of unnecessary promises
- [ ] write some useful benchmarks - compare async/await/throw implementation to IO

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
