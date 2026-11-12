import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXDB } from './exercises-data.js'
import names from '../exercise-names/zh.js'
import instructions from '../instr/zh.js'
import descriptions from '../exercise-desc/zh.js'
import { _setLangState, _setDetails, exerciseNameFor, instrFor, descFor } from './i18n-core.js'

const catalogue = JSON.parse(readFileSync(new URL('../../../catalogue/i18n/zh.json', import.meta.url), 'utf8'))
const han = /[\u3400-\u9fff]/

afterEach(() => { _setLangState('en', {}, null, null) })

describe('OEM Simplified Chinese exercise coverage', () => {
  it('every canonical exercise has Chinese names, descriptions and the full instruction sequence', () => {
    for (const ex of EXDB) {
      const source = JSON.parse(readFileSync(new URL(`../../../catalogue/exercises/${ex.id}.json`, import.meta.url), 'utf8'))
      const row = catalogue[ex.id]
      expect(row, ex.id).toBeTruthy()
      expect(row.name, ex.id).toMatch(han)
      expect(row.description, ex.id).toMatch(han)
      expect(row.instructions, ex.id).toHaveLength(source.instructions.length)
      for (const step of row.instructions) expect(step, ex.id).toMatch(han)
      expect(names[ex.id], ex.id).toBe(row.name)
      expect(instructions[ex.id], ex.id).toEqual(row.instructions)
      expect(descriptions[ex.id], ex.id).toBe(row.description)
    }
  })

  it('reads an exercise whose steps previously fell back to English in Chinese', () => {
    const ex = EXDB.find(e => e.id === '0005') // band alternate biceps curl
    _setLangState('zh', {}, instructions, names, false)
    _setDetails(null, null, descriptions, 'zh')
    expect(exerciseNameFor(ex)).toBe(names[ex.id])
    expect(descFor(ex)).toContain('弹力带')
    expect(instrFor(ex)).toHaveLength(6)
    expect(instrFor(ex).join(' ')).not.toMatch(/[a-z]{3,}/i)
  })
})
