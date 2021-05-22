### Core

- [x] add tests (property-based tests for monad laws?)
- [x] change then method to flatMap
- [x] support async
- [X] catch method
- [X] correct type restrictions on errors
- [x] sequence and parallel functions
- [x] race function

# Async, Concurrency & Fault Tolerance

- [x] wait function e.g. `.andThen(IO.wait(5, "seconds"))`
- [ ] timeout method (implement in terms of `IO.race`?)
- [ ] retry method
- [ ] cancellation
- [ ] fibers

# Performance & Internals

- [x] make recursive IO stack-safe
- [ ] optimise to avoid creation of unnecessary promises
- [ ] write some useful benchmarks - compare async/await/throw implementation to IO

### Ergonomics Improvements

- [x] lift function to return IO
- [X] map method
- [X] mapError method
- [ ] forEach method (and parallel equivalent)
- [ ] `.as` method
- [x] repeatForever method
- [ ] some more helper methods for composing independent IOs and returning the first or second value
- [ ] overload `andThen` to take an `IO` instead of a `() => IO`
- [ ] Support for partial functions in catch and andThen?