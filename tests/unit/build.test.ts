import { describe, expect, it } from 'vitest'
import { buildDay, buildLabel } from '../../src/build.ts'

describe('build', () => {
  it('names the UTC day', () => {
    expect(buildDay(new Date('2026-10-20T23:30:00-05:00'))).toBe('20261021')
    expect(buildDay(new Date('2026-01-05T00:00:00Z'))).toBe('20260105')
  })

  it('joins the protocol, the day and the commit', () => {
    expect(buildLabel(38, '20261020', '398c471')).toBe('v38.20261020.398c471')
  })
})
