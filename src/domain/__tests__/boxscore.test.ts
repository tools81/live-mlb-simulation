import { describe, expect, it } from 'vitest'
import { battingOrderSpot } from '../boxscore'

describe('battingOrderSpot', () => {
  it('parses the leading digit as the lineup spot, ignoring substitution digits', () => {
    expect(battingOrderSpot('100')).toBe(1)
    expect(battingOrderSpot('300')).toBe(3)
    expect(battingOrderSpot('601')).toBe(6)
    expect(battingOrderSpot('900')).toBe(9)
  })

  it('returns null when there is no batting order (e.g. an unused reliever)', () => {
    expect(battingOrderSpot(undefined)).toBeNull()
  })
})
