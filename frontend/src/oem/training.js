import { EXIDX } from '../lib/exercises.js'
import { uid } from '../lib/format.js'
import { switchGym } from '../lib/gym-inventory.js'
import { eqAvailable } from '../lib/equipment.js'
import { scheduleModeOf } from '../lib/rotation.js'
import { pickedExerciseConfig } from '../lib/history.js'
import { oemAllows } from '../../../api/coach/core/oem-equipment.js'

export const SCENES = ['home', 'gym']
export const GYM_KIT = ['dumbbell', 'barbell', 'cable', 'leverage machine', 'bench', 'pull-up bar']
export const sceneProfile = (S, scene) => (S.equipProfiles || []).find(p => p.oemTraining?.v === 1 && p.oemTraining.scene === scene)
export function initialSetup(S) {
  const active = (S.equipProfiles || []).find(p => p.id === S.activeEquipId)
  const prefs = active?.oemTraining || {}
  return {
    location: prefs.location || 'home', activeScene: prefs.scene || 'home',
    goal: prefs.goal || 'general', experience: prefs.experience || 'new', days: prefs.days || 3, minutes: prefs.minutes || 25,
    kit: Object.fromEntries(SCENES.map(scene => [scene, {
      equipment: sceneProfile(S, scene)?.equipment || (scene === 'home' ? ['body weight'] : ['body weight', ...GYM_KIT]),
      quiet: sceneProfile(S, scene)?.oemTraining.quiet ?? (scene === 'home'),
      dbCount: sceneProfile(S, scene)?.oemTraining.dbCount || 'pair',
    }])),
  }
}
export function draftProfile(draft, scene) {
  return { equipment: [...new Set(['body weight', ...draft.kit[scene].equipment])], accV: 2,
    oemTraining: { v: 1, scene, location: draft.location, goal: draft.goal, experience: draft.experience,
      days: draft.days, minutes: draft.minutes, quiet: draft.kit[scene].quiet, dbCount: draft.kit[scene].dbCount } }
}

// Each lane has an authored prescription, not a gym exercise copied into a home plan.
// Bodyweight-only back work is trunk control; a row requires a band or dumbbells.
export function recommend(profile) {
  const p = profile.oemTraining, fits = id => eqAvailable(profile.equipment, EXIDX[id]) && oemAllows(profile, EXIDX[id])
  const choose = ids => ids.find(fits)
  const experienced = p.experience === 'regular'
  const lanes = [
    choose(p.scene === 'gym' && experienced ? ['0739', '1760', '0534', '1197'] : ['1760', '0534', '1197']),
    choose([...(p.scene === 'gym' ? ['0289'] : []), '3668', '5093', experienced ? '0662' : '3211']),
    choose(['0293', '4837', '3899', '1241']),
    '2471', '0276', '0463',
  ]
  const count = p.minutes === 15 ? 4 : p.minutes === 25 ? 5 : 6
  const sets = p.minutes === 40 ? (experienced ? 4 : 3) : 2
  const ex = lanes.slice(0, count).map(id => {
    const cfg = { id, ...pickedExerciseConfig(id), sets, prog: 'off' }
    if (id === '0463') cfg.sec = experienced ? 30 : 20
    else cfg.reps = (['3211', '0662'].includes(id) ? (experienced ? 10 : 6) : p.goal === 'muscle' ? 10 : 12) * (cfg.side ? 2 : 1)
    return cfg
  })
  const minutesPerRound = ex.length * 1.6 + ex.filter(e => e.side).length * .5
  const fittedSets = Math.max(1, Math.min(sets, Math.floor((p.minutes - 5) / minutesPerRound)))
  ex.forEach(e => { e.sets = fittedSets })
  if (ex.some(e => !e.id || !fits(e.id))) throw new Error('No compatible starter plan')
  return { ex, days: ({ 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 6] })[p.days] || [1, 3, 5],
    // Warm-up + work + 60–90 second rests + transitions; deliberately approximate.
    estimatedMin: Math.round(5 + minutesPerRound * fittedSets), hasRow: ex.some(e => ['0293', '4837', '3899'].includes(e.id)) }
}

// Mutates a store draft, never history or existing routines. Confirm is idempotent and fills
// only vacant weekdays; programmes/rotation retain ownership of their schedules.
export function saveSetup(S, draft, names, now = Date.now()) {
  if (S.active) throw new Error('Finish the current workout first')
  const scenes = draft.location === 'both' ? SCENES : [draft.location]
  const active = scenes.includes(draft.activeScene) ? draft.activeScene : scenes[0]
  const ids = {}
  S.equipProfiles ||= []; S.routines ||= []; S.week ||= {}
  for (const scene of scenes) {
    const profile = draftProfile(draft, scene), plan = recommend(profile)
    let existing = sceneProfile(S, scene)
    if (!existing) {
      existing = { id: uid(), name: names[scene], plates: {}, dumbbells: {}, barDefaults: {}, stackWeights: {} }
      S.equipProfiles.push(existing)
    }
    Object.assign(existing, profile)
    // Explicit no-dumbbell inventory belongs to this scene, not the previous gym.
    existing.dumbbells = { ...existing.dumbbells, none: { on: !profile.equipment.includes('dumbbell'), _ts: now } }
    const signature = JSON.stringify(plan.ex)
    let routine = S.routines.find(r => r.oemTraining?.profileId === existing.id && JSON.stringify(r.ex) === signature)
    if (!routine) {
      routine = { id: uid(), name: names[scene] + ' · ' + names.plan, emoji: 'figureStrength', ex: plan.ex,
        oemTraining: { v: 1, profileId: existing.id } }
      S.routines.push(routine)
    }
    existing.oemTraining.routineId = routine.id
    ids[scene] = routine.id
  }
  const target = sceneProfile(S, active)
  // Make inventory load even if editing the currently active scene.
  if (S.activeEquipId === target.id) {
    S.dumbbells = structuredClone(target.dumbbells)
  } else switchGym(S, target.id, now)
  S.equipFilterOn = true
  if (!S.programme && scheduleModeOf(S) === 'week') {
    for (const day of recommend(target).days) {
      const current = Array.isArray(S.week[day]) ? S.week[day] : S.week[day] ? [S.week[day]] : []
      if (!current.some(id => S.routines.some(r => r.id === id))) S.week[day] = [ids[active]]
    }
  }
  return ids[active]
}

export function selectScene(S, id) {
  if (S.active) return false
  const p = S.equipProfiles?.find(p => p.id === id && p.oemTraining?.v === 1)
  if (!p) return false
  switchGym(S, id)
  S.equipFilterOn = true
  return true
}
