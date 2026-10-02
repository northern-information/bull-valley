// A stand-in for the `cloudflare:workers` module under vitest: the base
// class holds ctx and env, nothing more. See vitest.config.ts.

export class DurableObject<E = unknown> {
  ctx: DurableObjectState
  env: E
  constructor(ctx: DurableObjectState, env: E) {
    this.ctx = ctx
    this.env = env
  }
}
