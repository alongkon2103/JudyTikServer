export interface Clock {
  now(): Date
}
export const CLOCK = Symbol('ServerClock')
export const systemClock: Clock = { now: () => new Date() }
