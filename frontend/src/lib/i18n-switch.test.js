// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.doUnmock('../locales/de.js'); vi.doUnmock('../locales/zh.js') })

const delayedGerman = () => {
  let release, started
  const waiting = new Promise(r => { started = r })
  const gate = new Promise(r => { release = r })
  vi.doMock('../locales/de.js', async () => {
    started()
    await gate
    return { default: { Plan: 'Plan (de)' } }
  })
  return { waiting, release }
}

describe('language selection', () => {
  it('keeps Chinese when an older German request finishes last', async () => {
    const slow = delayedGerman()
    const i18n = await import('./i18n.js')
    const pending = i18n.setLang('de')
    await slow.waiting
    await i18n.setLang('zh')
    slow.release()
    await pending
    expect(i18n.getLang()).toBe('zh')
    expect(i18n.t('Plan')).toBe('计划')
    expect(document.documentElement.lang).toBe('zh')
    expect(i18n.exerciseNameFor({ id: '0025', n: 'barbell bench press' })).not.toMatch(/bench/)
  })

  it('returning to the already loaded language cancels an outstanding selection', async () => {
    const slow = delayedGerman()
    const i18n = await import('./i18n.js')
    await i18n.setLang('en')
    const pending = i18n.setLang('de')
    await slow.waiting
    await i18n.setLang('en')
    slow.release()
    await pending
    expect(i18n.getLang()).toBe('en')
    expect(i18n.t('Plan')).toBe('Plan')
  })

  it('retries a failed Chinese pack instead of caching the English fallback as success', async () => {
    let online = false
    vi.doMock('../locales/zh.js', async () => {
      if (!online) throw new Error('offline')
      return { default: { Plan: '计划' } }
    })
    const i18n = await import('./i18n.js')
    await i18n.setLang('zh')
    expect(i18n.t('Plan')).toBe('Plan')
    online = true
    await i18n.setLang('zh')
    expect(i18n.t('Plan')).toBe('计划')
  })

  it('shows Chinese names by default while preserving optional English and custom names', async () => {
    const i18n = await import('./i18n.js')
    const ex = { id: '0025', n: 'barbell bench press' }
    await i18n.setLang('zh')
    expect(i18n.exerciseNameFor(ex)).toMatch(/[\u3400-\u9fff]/)
    expect(i18n.exerciseNameFor(ex)).not.toContain(ex.n)
    expect(i18n.exerciseNameSearchText(ex)).toContain(ex.n)
    expect(i18n.exerciseNameFor({ id: 'custom-lift', n: 'My lift' })).toBe('My lift')
    await i18n.setLang('zh', true)
    expect(i18n.exerciseNameFor(ex)).toContain(`(${ex.n})`)
    await i18n.setLang('zh', false, true)
    expect(i18n.exerciseNameFor(ex)).toBe(ex.n)
  })
})
