// Shared by the phone, web picker and Coach. Only OEM profiles opt into these stricter rules.
// Catalogue text is imperfect: this is a conservative filter, not a safety certification.
export function oemProfile(S) {
  return S?.equipFilterOn ? S.equipProfiles?.find(p => p.id === S.activeEquipId && p.oemTraining?.v === 1) : null;
}

export function oemAllows(profile, ex) {
  if (!profile?.oemTraining || !ex) return true;
  const have = profile.equipment || [], n = (ex.n || '').toLowerCase();
  if (ex.eq && ex.eq !== 'body weight' && !have.includes(ex.eq)) return false;
  const needs = new Set(ex.nd || []);
  const machine = ['leverage machine', 'sled machine', 'assisted', 'smith machine'].includes(ex.eq);
  if (!machine) {
    if (/bench|incline|decline|chest support/.test(n)) needs.add('bench');
    if (/pull[ -]?up|chin[ -]?up|hanging|dead hang|muscle[ -]?up/.test(n)) needs.add('pull-up bar');
    if (/exercise ball|stability ball|swiss ball/.test(n)) needs.add('stability ball');
    if (/bosu/.test(n)) needs.add('bosu ball');
    // These supports are not selectable in the upstream equipment schema yet.
    if (/\bbox\b|parallel bar|\brings?\b|inverted row|\bchair\b|\bstool\b|\bstep\b|\bpartner\b|\bwall\b|door anchor|hyperextension|45.degree|roman chair|glute.ham raise|nordic|sissy squat|abmat|agility|\bstick\b|\btowel\b|\bslider|\bsliding/.test(n)) return false;
    if (/\bdip\b/.test(n)) return false;
    if (ex.eq === 'dumbbell' && /\b(fly|pullover)\b/.test(n) && !/floor|standing|bent over/.test(n)) needs.add('bench');
    if (ex.eq === 'dumbbell' && /\bseated\b/.test(n) && !/floor/.test(n)) needs.add('bench');
  }
  if (![...needs].every(e => have.includes(e))) return false;
  if (profile.oemTraining.quiet && /jump|hop\b|burpee|running|sprint|jack\b|plyo|clap/.test(n)) return false;
  // A single bell can only use clearly named unilateral/two-handed lifts. Unknown is excluded.
  if (ex.eq === 'dumbbell' && profile.oemTraining.dbCount === 'single'
    && !/single|one arm|one-arm|goblet|two hand|both hand/.test(n)) return false;
  return true;
}
