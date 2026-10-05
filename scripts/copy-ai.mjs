// Lists the lines in COPY.toml still marked by = "ai": the ones no one has
// revised or signed off on yet. `npm run copy:ai`.

import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'

const tree = parse(
  readFileSync(new URL('../COPY.toml', import.meta.url), 'utf8')
)

function* entries(node, prefix) {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name
    if ('text' in value) yield [key, value]
    else yield* entries(value, key)
  }
}

let ai = 0
let total = 0
for (const [key, { text, by }] of entries(tree, '')) {
  total += 1
  if (by !== 'ai') continue
  ai += 1
  console.log(`${key}\n  ${text.replaceAll('\n', '\n  ')}`)
}
console.log(`\n${ai} of ${total} lines are still marked "ai".`)
