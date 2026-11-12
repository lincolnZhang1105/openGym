import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { ALL_EQUIPMENT } from '../lib/equipment.js'
import { EXIDX } from '../lib/exercises.js'
import { exLine } from '../lib/history.js'
import { Button } from '../components/ui.jsx'
import { startFlow } from '../sheets.jsx'
import { initialSetup, draftProfile, recommend, saveSetup } from './training.js'
import './training.css'

const sceneName = scene => scene === 'home' ? t('At home') : t('Gym')
const common = ['dumbbell', 'band', 'kettlebell', 'bench', 'pull-up bar']
function Choices({ value, options, onChange }) {
  return <div className="oem-choices">{options.map(([id, label]) => <button type="button" key={id} className={'oem-choice' + (value === id ? ' selected' : '')}
    aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}</div>
}

export default function TrainingSetup() {
  const S = useStore(s => s.S), nav = useNavigate(), saving = useRef(false)
  const [draft, setDraft] = useState(() => initialSetup(S)), [step, setStep] = useState(0)
  const set = values => setDraft(d => ({ ...d, ...values }))
  const scenes = draft.location === 'both' ? ['home', 'gym'] : [draft.location]
  const setKit = (scene, values) => setDraft(d => ({ ...d, kit: { ...d.kit, [scene]: { ...d.kit[scene], ...values } } }))
  const save = start => {
    if (saving.current || useStore.getState().S.active) return
    saving.current = true
    let id
    try {
      useStore.getState().update(s => { id = saveSetup(s, draft, { home: sceneName('home'), gym: sceneName('gym'), plan: t('Full-body starter') }) })
      nav('/home', { replace: true })
      if (start) startFlow([id])
    } finally { saving.current = false }
  }
  return <div className="narrow oem-setup">
    <div className="hdr"><h1>{t('Train your way')}</h1><Button size="sm" onClick={() => nav('/home')}>{t('Cancel')}</Button></div>
    <div className="oem-progress" aria-label={`${step + 1} / 4`}>{[0, 1, 2, 3].map(i => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
    <p className="dim">{step + 1} / 4</p>
    {S.active ? <div className="card"><p role="alert">{t('Finish your current workout before changing your setup.')}</p><Button onClick={() => nav('/workout')}>{t('Resume')}</Button></div> : <>
      {step === 0 && <div className="card">
        <h2>{t('Choose where you train. You can change this later.')}</h2>
        <Choices value={draft.location} options={[[ 'home', sceneName('home') ], ['gym', sceneName('gym')], ['both', t('Home and gym')]]}
          onChange={location => set({ location, activeScene: location === 'both' ? 'home' : location })} />
      </div>}
      {step === 1 && <>
        <p className="dim">{t('Your equipment filters exercises and Coach suggestions.')}</p>
        {scenes.map(scene => {
          const kit = draft.kit[scene], visibleKit = scene === 'gym' ? [...common, 'barbell', 'cable', 'leverage machine'] : common
          const toggle = e => setKit(scene, { equipment: kit.equipment.includes(e) ? kit.equipment.filter(x => x !== e) : [...kit.equipment, e] })
          const check = e => <button type="button" key={e} className={'oem-choice' + (kit.equipment.includes(e) ? ' selected' : '')} aria-pressed={kit.equipment.includes(e)} onClick={() => toggle(e)}>{t(e)}</button>
          return <section className="card" key={scene}><h2>{sceneName(scene)}</h2>
            <Button variant={kit.equipment.every(e => e === 'body weight') ? 'primary' : 'plain'} onClick={() => setKit(scene, { equipment: ['body weight'] })}>{t('Bodyweight only')}</Button>
            <div className="oem-choices">{visibleKit.map(check)}</div>
            <details><summary>{t('All equipment')}</summary><div className="oem-choices">{ALL_EQUIPMENT.filter(e => !visibleKit.includes(e) && e !== 'body weight').map(check)}</div></details>
            {kit.equipment.includes('dumbbell') && <><h3>{t('Dumbbells')}</h3><Choices value={kit.dbCount} options={[['single', t('One dumbbell')], ['pair', t('A pair of dumbbells')]]} onChange={dbCount => setKit(scene, { dbCount })} />
              <p className="small dim">{t('Weights can be set later in Equipment settings.')}</p></>}
            <button type="button" className={'oem-choice' + (kit.quiet ? ' selected' : '')} aria-pressed={kit.quiet} onClick={() => setKit(scene, { quiet: !kit.quiet })}>{t('Quiet training')}</button>
          </section>
        })}
      </>}
      {step === 2 && <div className="card">
        <h2>{t('Goal')}</h2><Choices value={draft.goal} options={[[ 'general', t('General fitness') ], ['muscle', t('Build muscle')], ['fatloss', t('Lose fat')]]} onChange={goal => set({ goal })} />
        <h2>{t('Experience')}</h2><Choices value={draft.experience} options={[['new', t('New to lifting')], ['returning', t('Coming back after a break')], ['regular', t('Training regularly')]]} onChange={experience => set({ experience })} />
        <h2>{t('Days per week')}</h2><Choices value={draft.days} options={[2, 3].map(n => [n, String(n)])} onChange={days => set({ days })} />
        <h2>{t('Session length')}</h2><Choices value={draft.minutes} options={[15, 25, 40].map(n => [n, `${n} ${t('Minutes')}`])} onChange={minutes => set({ minutes })} />
      </div>}
      {step === 3 && <>
        <h2>{t('Review your starter plan')}</h2><p className="dim">{t('Based on your equipment, experience and available time.')}</p>
        {draft.location === 'both' && <Choices value={draft.activeScene} options={scenes.map(s => [s, sceneName(s)])} onChange={activeScene => set({ activeScene })} />}
        {scenes.map(scene => { const plan = recommend(draftProfile(draft, scene)); return <section className="card" key={scene}>
          <h3>{sceneName(scene)} · {t('Full-body starter')}</h3><p className="dim">{t('About {0} min · {1} days/week', plan.estimatedMin, draft.days)}</p>
          <ol className="oem-exercises">{plan.ex.map(e => <li key={e.id}><strong>{exerciseNameFor(EXIDX[e.id])}</strong><span className="dim">{exLine(e, S.unit)}</span></li>)}</ol>
          {!plan.hasRow && <p className="small dim">{t('Bodyweight back work builds control. Add a band or dumbbells for rows.')}</p>}
        </section> })}
        <p className="small dim">{t('Existing plans and records stay. Only empty weekdays are filled.')}</p>
        <p className="small dim">{t('Warm up first. Choose a comfortable load and stop if you feel pain.')}</p>
      </>}
      <div className="oem-actions">{step > 0 && <Button onClick={() => setStep(n => n - 1)}>{t('Back')}</Button>}
        {step < 3 ? <Button variant="primary" onClick={() => { setStep(n => n + 1); window.scrollTo(0, 0) }}>{t('Continue')}</Button> : <><Button onClick={() => save(false)}>{t('Save')}</Button><Button variant="primary" onClick={() => save(true)}>{t('Save and start')}</Button></>}
      </div>
    </>}
  </div>
}
