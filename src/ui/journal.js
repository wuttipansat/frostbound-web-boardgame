// Colony journal (step 21): the public log retold as short diary lines, one "day" per round, with a
// one-line day summary and the few lines that made the story (for the ending). Public log only:
// names, places and counts, never which card was found.
import { t, c } from '../i18n/index.js';

const W = { death: 5, exiled: 5, crisisFail: 4, overrun: 3, infection: 4, recruit: 3, crisisOk: 2, starvation: 3, kills: 2, search: 1, barricadeBroken: 2, vote: 2 };

/** Journal events: [{ round, key, params, weight }] in log order. */
export function journalEntries(state) {
  if (!state?.log) return [];
  const sv = (id) => c('survivors', id, 'name');
  const loc = (id) => c('locations', id, 'name');
  const pl = (id) => state.players.find((p) => p.id === id)?.name ?? '?';
  const out = [];
  const add = (e, key, params, weight) => out.push({ round: e.r ?? 1, key, params, weight });
  for (const e of state.log) {
    switch (e.k) {
      case 'search': if (e.count) add(e, 'search', { name: sv(e.survivorId), place: loc(e.locationId), n: e.count }, e.count >= 2 ? W.search + 1 : W.search); break;
      case 'attack': if (e.killed >= 2) add(e, 'kills', { name: sv(e.survivorId), place: loc(e.locationId), n: e.killed }, W.kills); break;
      case 'death': add(e, 'death', { name: sv(e.survivorId), place: loc(e.location), cause: t(`cause.${e.cause}`) }, W.death); break;
      case 'recruit': add(e, 'recruit', { name: sv(e.survivorId), place: loc(e.location) }, W.recruit); break;
      case 'exiled': add(e, 'exiled', { player: pl(e.playerId) }, W.exiled); break;
      case 'voteResult': if (!e.passed) add(e, 'voteFailed', { player: pl(e.targetId) }, W.vote); break;
      case 'overrun': add(e, 'overrun', { place: loc(e.locationId) }, W.overrun); break;
      case 'barricadeBroken': add(e, 'barricadeBroken', { place: loc(e.locationId) }, W.barricadeBroken); break;
      case 'infectionSpreads': add(e, 'infection', { name: sv(e.from), other: sv(e.to) }, W.infection); break;
      case 'starvation': add(e, 'starvation', {}, W.starvation); break;
      case 'crisisResolved': add(e, e.success ? 'crisisOk' : 'crisisFail', { crisis: c('crises', e.crisisId, 'name') }, e.success ? W.crisisOk : W.crisisFail); break;
      default: break;
    }
  }
  return out;
}

/** Totals of one round: { deaths, kills, found, morale } (morale = net change). */
export function dayTotals(state, round) {
  const d = { deaths: 0, kills: 0, found: 0, morale: 0 };
  for (const e of state?.log ?? []) {
    if ((e.r ?? 1) !== round) continue;
    if (e.k === 'death') d.deaths++;
    else if (e.k === 'attack') d.kills += e.killed ?? 0;
    else if (e.k === 'search') d.found += e.count ?? 0;
    else if (e.k === 'morale') d.morale += e.delta ?? 0;
  }
  return d;
}

/** "Day 3: 1 lost · 4 zombies killed · morale −2" (quiet day when nothing happened). */
export function daySummary(state, round) {
  const d = dayTotals(state, round);
  const bits = [];
  if (d.deaths) bits.push(t('jr.sum.deaths', { n: d.deaths }));
  if (d.kills) bits.push(t('jr.sum.kills', { n: d.kills }));
  if (d.found) bits.push(t('jr.sum.found', { n: d.found }));
  if (d.morale) bits.push(t('jr.sum.morale', { n: d.morale > 0 ? `+${d.morale}` : `−${-d.morale}` }));
  return `${t('jr.day', { n: round })}: ${bits.length ? bits.join(' · ') : t('jr.sum.quiet')}`;
}

export const journalLine = (j) => `${t('jr.day', { n: j.round })} — ${t(`jr.${j.key}`, j.params)}`;

/** The lines that made the story: the `n` heaviest, back in the order they happened. */
export function highlights(state, n = 4) {
  return journalEntries(state).map((j, i) => ({ ...j, i }))
    .sort((a, b) => b.weight - a.weight || b.i - a.i).slice(0, n)
    .sort((a, b) => a.i - b.i);
}
