import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { Button } from '../components/ui.jsx'
import { t } from '../lib/i18n.js'
import { exAvailable } from '../lib/equipment.js'
import { exOr } from '../lib/exercises.js'
import { startFlow } from '../sheets.jsx'
import { selectScene } from './training.js'
import './training.css'

export default function TrainingCard() {
  const S = useStore(s => s.S), nav = useNavigate()
  const profiles = (S.equipProfiles || []).filter(p => p.oemTraining?.v === 1)
  const active = profiles.find(p => p.id === S.activeEquipId)
  const routine = S.routines.find(r => r.id === active?.oemTraining.routineId)
  const fits = routine?.ex.every(e => exAvailable(S, exOr(e.id)))
  return <section className="card oem-training-card">
    <div className="row between"><h2>{t('Train your way')}</h2><Button size="sm" onClick={() => nav('/training-setup')}>{profiles.length ? t('Edit') : t('Continue')}</Button></div>
    {!profiles.length ? <p className="dim">{t('Choose where you train. You can change this later.')}</p> : <>
      <div className="oem-choices">{profiles.map(p => <button type="button" key={p.id} disabled={!!S.active} className={'oem-choice' + (S.equipFilterOn && p.id === S.activeEquipId ? ' selected' : '')}
        aria-pressed={S.equipFilterOn && p.id === S.activeEquipId} onClick={() => useStore.getState().update(s => { selectScene(s, p.id) })}>{p.name}</button>)}</div>
      {S.active ? <p className="small dim">{t('Finish your current workout before changing your setup.')}</p> : routine && <>
        <p>{routine.name}</p>
        {fits ? <Button variant="primary" onClick={() => startFlow([routine.id])}>{t('Start workout')}</Button> : <p className="small dim">{t('Some exercises need other equipment. Choose a compatible plan or switch location.')}</p>}
      </>}
      <Button size="sm" variant="ghost" onClick={() => nav('/settings/equipment')}>{t('Equipment')}</Button>
    </>}
  </section>
}
