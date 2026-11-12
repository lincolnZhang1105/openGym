import { describe, it, expect } from 'vitest'
import { initialSetup, draftProfile, recommend, saveSetup, selectScene, sceneProfile } from './training.js'
import { EXIDX } from '../lib/exercises.js'
import { exAvailable } from '../lib/equipment.js'
import { syncGymInventory } from '../lib/gym-inventory.js'
import { stampChange, mergeStates } from '../lib/sync-merge.js'
import { stampPut } from '../../../api/sync-stamps.js'
import { build } from '../../../api/coach/core/payload.js'
import { validatePlan } from '../../../api/coach/core/validate.js'
import { LIB_BY_ID } from '../../../api/coach/core/library.js'
import { oemAllows } from '../../../api/coach/core/oem-equipment.js'
import { applyCreatedPlan, applyChangeSet } from '../lib/coach.js'

const base = () => ({ unit: 'kg', workouts: [], routines: [], week: {}, dayPlan: {}, bodyweight: [], customEx: [], equipProfiles: [], dumbbells: {}, plates: {}, exWeights: {} })
const names = { home: '家中', gym: '健身房', plan: '全身入门' }
const clone = x => JSON.parse(JSON.stringify(x))

describe('OEM training setup', () => {
  it('builds complete compatible plans across equipment, experience and time combinations', () => {
    const kit = ['dumbbell', 'band', 'bench', 'kettlebell', 'pull-up bar']
    for (let mask = 0; mask < 32; mask++) for (const scene of ['home', 'gym']) for (const dbCount of ['single', 'pair']) for (const experience of ['new', 'regular']) for (const minutes of [15, 25, 40]) {
      const d = initialSetup(base()); d.experience = experience; d.minutes = minutes
      d.kit[scene] = { equipment: kit.filter((_, i) => mask & (1 << i)), dbCount, quiet: true }
      const p = draftProfile(d, scene), plan = recommend(p)
      const S = { equipProfiles: [{ ...p, id: 'test' }], activeEquipId: 'test', equipFilterOn: true }
      expect(plan.ex.length).toBeGreaterThanOrEqual(4)
      expect(plan.estimatedMin).toBeLessThanOrEqual(minutes)
      expect(new Set(plan.ex.map(e => e.id)).size).toBe(plan.ex.length)
      for (const ex of plan.ex) {
        expect(exAvailable(S, EXIDX[ex.id]), `${scene} ${mask} ${dbCount} ${ex.id}`).toBe(true)
        expect(ex.sets).toBeGreaterThan(0)
        expect(ex.mode === 'time' ? ex.sec : ex.reps).toBeGreaterThan(0)
      }
    }
  })

  it('distinguishes bare floor, pairs, single bells and bands, including per-side reps and timed planks', () => {
    const d = initialSetup(base()); d.minutes = 40
    let plan = recommend(draftProfile(d, 'home'))
    expect(plan.ex.every(e => EXIDX[e.id].eq === 'body weight')).toBe(true)
    expect(plan.ex.find(e => e.id === '0463')).toMatchObject({ mode: 'time', sec: 20, bodyweight: true })
    d.kit.home.equipment.push('dumbbell'); d.kit.home.dbCount = 'single'
    plan = recommend(draftProfile(d, 'home'))
    expect(plan.ex.find(e => e.id === '4837')).toMatchObject({ side: true, reps: 24 })
    expect(plan.ex.some(e => e.id === '0293')).toBe(false)
    d.kit.home.equipment = ['band']
    expect(recommend(draftProfile(d, 'home')).ex.some(e => e.id === '3899')).toBe(true)
  })

  it('keeps history, edited routines and occupied weekdays; repeated confirmation adds no duplicates', () => {
    const S = base(); S.workouts = [{ id: 'past', entries: [{ id: '0025', sets: [{ w: 40, r: 8, done: true }] }] }]
    S.routines = [{ id: 'own', name: '我的计划', ex: [{ id: '0025', sets: 3, reps: 8 }] }]; S.week = { 1: ['own'] }
    const before = clone(S), d = initialSetup(S); d.location = 'both'
    const id = saveSetup(S, d, names)
    expect(S.workouts).toEqual(before.workouts); expect(S.routines[0]).toEqual(before.routines[0]); expect(S.week[1]).toEqual(['own'])
    expect(S.week[3]).toEqual([id]); expect(S.equipProfiles).toHaveLength(2)
    saveSetup(S, d, names)
    expect(S.routines).toHaveLength(3)
    S.routines.find(r => r.id === id).ex[0].reps = 99
    saveSetup(S, d, names)
    expect(S.routines.find(r => r.id === id).ex[0].reps).toBe(99)
    expect(S.routines).toHaveLength(4)
  })

  it('isolates scene inventories, retains the previous gym, and blocks switching during a session', () => {
    const S = base(); S.equipProfiles = [{ id: 'old', name: 'Old', equipment: ['barbell'] }]; S.activeEquipId = 'old'; S.dumbbells = { kg: { weights: [18], _ts: 1 } }
    syncGymInventory(S)
    const d = initialSetup(S); d.location = 'both'
    saveSetup(S, d, names); syncGymInventory(S)
    expect(S.dumbbells.none.on).toBe(true)
    expect(S.equipProfiles.find(p => p.id === 'old').dumbbells.kg.weights).toEqual([18])
    const gym = sceneProfile(S, 'gym'); selectScene(S, gym.id); syncGymInventory(S)
    expect(S.dumbbells.none.on).toBe(false)
    const before = clone(S); S.active = { id: 'live', entries: [] }
    expect(selectScene(S, sceneProfile(S, 'home').id)).toBe(false)
    expect(S.activeEquipId).toBe(before.activeEquipId)
    expect(() => saveSetup(S, d, names)).toThrow()
    expect(S.active.id).toBe('live')
  })

  it('does not replace programme or rotation schedules and leaves abandoned drafts unsaved', () => {
    for (const extra of [{ programme: 'p1' }, { scheduleMode: 'rotation' }]) {
      const S = { ...base(), ...extra }, before = clone(S), d = initialSetup(S)
      d.kit.home.equipment = ['dumbbell']
      expect(S).toEqual(before)
      saveSetup(S, d, names)
      expect(S.week).toEqual({})
    }
  })

  it('round-trips profile metadata through JSON backup, frontend merging and server stamps', () => {
    const old = base(), next = clone(old)
    saveSetup(next, initialSetup(next), names, 1000); stampChange(old, next, 1000)
    const restored = clone(next), server = clone(restored)
    stampPut(old, server, { stamped: true, now: 2000 })
    const merged = mergeStates(old, server)
    expect(sceneProfile(merged, 'home').oemTraining).toEqual(sceneProfile(restored, 'home').oemTraining)
    expect(merged.activeEquipId).toBe(restored.activeEquipId)
    expect(merged.routines[0].oemTraining).toEqual(restored.routines[0].oemTraining)
    expect(merged.week).toEqual(restored.week)
  })
})

describe('shared scene constraints', () => {
  it('uses identical accessory metadata for every catalogue exercise on phone and Coach', () => {
    const d = initialSetup(base()), p = { ...draftProfile(d, 'home'), id: 'home' }
    const S = { ...base(), equipProfiles: [p], activeEquipId: 'home', equipFilterOn: true }
    for (const equipment of [['body weight'], ['body weight', 'dumbbell'], ['body weight', 'dumbbell', 'bench', 'pull-up bar'], ['smith machine', 'body weight']]) {
      p.equipment = equipment
      for (const ex of Object.values(EXIDX)) {
        expect(exAvailable(S, ex), ex.id).toBe(oemAllows(p, LIB_BY_ID.get(ex.id)))
      }
    }
  })

  it('rejects stale equipment proposals at acceptance before writing any snapshots or plan data', () => {
    const S = base(); saveSetup(S, initialSetup(S), names)
    const before = clone(S)
    const ex = { id: '0289', sets: 3, reps: 8 }
    expect(() => applyCreatedPlan(S, { id: 'p', bundle: { routines: [{ id: 'r', name: 'Gym', ex: [ex] }] } })).toThrow()
    expect(S).toEqual(before)
    expect(() => applyChangeSet(S, { id: 'p', changes: [{ id: 'c', type: 'add-exercise', target: { routineId: S.routines[0].id }, after: ex }] }, ['c'])).toThrow()
    expect(S).toEqual(before)
  })

  it('filters accessories, jumps and two-bell lifts in both the picker and Coach', () => {
    const d = initialSetup(base()); d.kit.home.equipment = ['body weight', 'dumbbell']; d.kit.home.dbCount = 'single'
    const p = { ...draftProfile(d, 'home'), id: 'home' }, S = { ...base(), equipProfiles: [p], activeEquipId: 'home', equipFilterOn: true }
    for (const id of ['0289', '0293', '0662', '1760', '4837', '0463']) {
      expect(exAvailable(S, EXIDX[id]), id).toBe(oemAllows(p, LIB_BY_ID.get(id)))
    }
    expect(exAvailable(S, EXIDX['0289'])).toBe(false)
    expect(oemAllows(p, { n: 'jump squat', eq: 'body weight' })).toBe(false)
    expect(oemAllows(p, { n: 'box squat', eq: 'body weight' })).toBe(false)
    expect(oemAllows(p, { n: 'pull-up', eq: 'body weight' })).toBe(false)
    p.equipment.push('pull-up bar')
    expect(oemAllows(p, { n: 'pull-up', eq: 'body weight' })).toBe(true)
  })

  it('selected scene overrides stale AI intake, and validation rejects unavailable even historically pinned exercises', () => {
    const S = base(), d = initialSetup(S); saveSetup(S, d, names)
    S.coach = { profile: { equipment: ['barbell', 'cable'], goal: 'strength', daysPerWeek: 6 } }
    S.routines.push({ id: 'old', name: 'Gym', ex: [{ id: '0289', sets: 3, reps: 8, weight: 10 }] })
    const payload = build(S, { handle: 'test', kind: 'create' })
    expect(payload.coachProfile).toMatchObject({ equipment: ['body weight'], daysPerWeek: 3, goal: 'general', sessionMin: 25 })
    const candidate = id => ({ routines: [{ id: 'r', name: 'Test', ex: [{ id, sets: 2, reps: 10 }] }], week: { 1: 'r' } })
    const ctx = { equipment: payload.coachProfile.equipment, equipmentRules: payload.equipmentRules }
    expect(validatePlan(candidate('0289'), ctx).ok).toBe(false)
    expect(validatePlan(candidate('0662'), ctx).ok).toBe(true)
    const history = new Set(['0289', ...S.routines.flatMap(r => r.ex.map(e => e.id))])
    for (const e of payload.library.filter(e => !history.has(e.id))) expect(oemAllows(payload.equipmentRules, LIB_BY_ID.get(e.id))).toBe(true)
  })
})
