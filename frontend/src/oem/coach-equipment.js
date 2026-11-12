import { EXIDX } from '../lib/exercises.js'
import { exAvailable } from '../lib/equipment.js'
import { t } from '../lib/i18n-core.js'
import { oemProfile } from '../../../api/coach/core/oem-equipment.js'

// Recheck at acceptance: a cloud request can finish after the user switched locations.
export const oemCanAdd = (S, id) => !oemProfile(S) || !EXIDX[id] || exAvailable(S, EXIDX[id])
export function assertOemExercises(S, ids) {
  if (ids.some(id => !oemCanAdd(S, id))) throw new Error(t('Some exercises need other equipment. Choose a compatible plan or switch location.'))
}
export const changeExerciseIds = c => c.type === 'add-routine' ? (c.after?.ex || []).map(e => e.id)
  : ['add-exercise', 'swap-exercise'].includes(c.type) ? [c.after?.id] : []
