// The few Node APIs the D1 shim (d1.ts) uses. The Worker tests are typed
// against the Workers runtime, whose globals clash with @types/node, so
// this declares only what the shim calls.

interface ImportMeta {
  readonly url: string
}

declare module 'node:fs' {
  export function readdirSync(path: URL): string[]
  export function readFileSync(path: URL, encoding: 'utf8'): string
}

declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array
  export class StatementSync {
    get(...values: SQLInputValue[]): unknown
    all(...values: SQLInputValue[]): unknown[]
    run(...values: SQLInputValue[]): { changes: number | bigint }
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
  }
}
