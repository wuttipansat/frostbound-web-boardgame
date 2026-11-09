// Turns engine log entries and effect lists into localized text.
import { t, c, signed, crossChoice } from './index.js';

const QUIET = new Set(['turnEnd', 'roll', 'draw', 'energy']); // too noisy for the log panel

function names() {
  return {
    survivor: (id) => c('survivors', id, 'name'),
    loc: (id) => c('locations', id, 'name'),
    item: (type) => (type ? t(`item.${type}`) : t('item.any')),
    card: (defId) => c('items', defId, 'name'),
  };
}

/** Localized single line for a log entry, or null to hide it. */
export function formatLog(e, state) {
  if (QUIET.has(e.k)) return null;
  const n = names();
  const p = {
    survivor: n.survivor(e.survivorId),
    loc: n.loc(e.locationId),
    to: e.k === 'infectionSpreads' ? n.survivor(e.to) : n.loc(e.to),
    n: e.n ?? e.count ?? e.wounds ?? e.killed ?? e.removed ?? e.need ?? e.tokens ?? e.total ?? '',
    d: e.delta != null ? signed(e.delta) : '',
    value: e.value,
    round: e.round,
    crisis: c('crises', e.crisisId, 'name'),
    card: e.card ? n.card(e.card) : '',
    item: n.item(e.itemType),
    face: e.face ? t(`face.${e.face}`) : '',
    cause: e.cause ? t(`cause.${e.cause}`) : '',
    reason: e.reason ? t(`reason.${e.reason}`) : '',
    score: e.score,
    required: e.required,
    title: e.cardId ? c('crossroads', e.cardId, 'title') : '',
  };
  switch (e.k) {
    case 'move': return t(e.safe ? 'log.moveSafe' : 'log.move', p);
    case 'exposure': return t(e.danger ? 'log.dangerDraw' : 'log.exposure', p);
    case 'dangerShuffle': return t('log.dangerShuffle', { n: e.size });
    case 'dangerAdded': return t('log.dangerAdded', { kind: t(`danger.${e.kind}`) });
    case 'crisisResolved': return t('log.crisisResolved', { ...p, result: t(e.success ? 'log.crisisOk' : 'log.crisisFail') });
    case 'infectionSpreads': return t('log.infectionSpreads', p);
    case 'lure': return t('log.lure', p);
    case 'crossroadsChoice': return t('log.crossroadsChoice', { ...p, choice: crossChoice(e.cardId, e.choice) });
    case 'starvation': return t('log.starvation', { n: e.tokens });
    case 'fed': return t('log.fed', { n: e.need });
    case 'draftDone': return t('log.draftDone', { names: (e.survivorIds ?? []).map((id) => n.survivor(id)).join(', ') });
    case 'gameOver': return t('log.gameOver');
    default: {
      const key = `log.${e.k}`;
      const s = t(key, p);
      return s === key ? null : s;
    }
  }
}

/** Short human text for one effect of a crossroads choice or crisis failure. */
export function describeEffect(e) {
  const where = e.where === 'here' ? t('where.here') : e.where ? c('locations', e.where, 'name') : '';
  switch (e.type) {
    case 'morale': case 'food': case 'waste': case 'helpless': case 'starvation': case 'energy':
      return t(`eff.${e.type}`, { d: signed(e.delta) });
    case 'discard': return t('eff.discard', { n: e.n, item: e.item ? t(`item.${e.item}`) : '' });
    default: return t(`eff.${e.type}`, { n: e.n, where });
  }
}

/** Why a crossroads card triggered, e.g. "You have a survivor at the School". */
export function describeTrigger(cond) {
  return t(`trig.${cond.type}`, {
    n: cond.n,
    loc: cond.location ? c('locations', cond.location, 'name') : '',
    item: cond.item ? t(`item.${cond.item}`) : '',
  });
}

export function describeEffects(list) {
  return list.length ? list.map(describeEffect).join(' · ') : t('eff.nothing');
}
