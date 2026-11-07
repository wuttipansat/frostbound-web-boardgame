// Temporary English event text for the step-3 demo ticker (full EN/TH i18n arrives with the UI in step 4).
import { SURVIVORS_BY_ID } from '../content/survivors.js';
import { LOCATIONS } from '../content/locations.js';
import { CRISES_BY_ID } from '../content/crises.js';
import { CROSSROADS_BY_ID } from '../content/crossroads.js';

const sv = (id) => SURVIVORS_BY_ID[id]?.name ?? id;
const loc = (id) => LOCATIONS[id]?.name ?? id;
/** "the Library", "the colony" */
const at = (id) => (id === 'colony' ? 'the colony' : `the ${loc(id)}`);

export function describe(e, state) {
  const pname = (pid) => state.players.find((p) => p.id === pid)?.name ?? pid;
  switch (e.k) {
    case 'roundStart': return `Round ${e.round}: ${CRISES_BY_ID[e.crisisId]?.name ?? 'crisis'} strikes the colony.`;
    case 'turnStart': return `${pname(e.playerId)}'s turn.`;
    case 'move': return `${sv(e.survivorId)} heads to ${at(e.to)}${e.safe ? ' safely' : ''}.`;
    case 'exposure': return e.face === 'blank' ? null : `${sv(e.survivorId)} rolls exposure: ${e.face.toUpperCase()}!`;
    case 'attack': return `${sv(e.survivorId)} kills ${e.killed} zombie${e.killed === 1 ? '' : 's'} at ${at(e.locationId)}.`;
    case 'search': return `${sv(e.survivorId)} searches ${at(e.locationId)} (${e.count} card${e.count === 1 ? '' : 's'}).`;
    case 'barricade': return `Barricade raised at ${at(e.locationId)}.`;
    case 'spawn': return e.reason === 'lure' ? `Zombies lured to ${at(e.locationId)}.` : `${e.n} zombie${e.n === 1 ? '' : 's'} rise from the snow at ${at(e.locationId)}.`;
    case 'death': return `☠ ${sv(e.survivorId)} has died (${e.cause}).`;
    case 'recruit': return `${sv(e.survivorId)} joins ${pname(e.playerId)}.`;
    case 'crossroadsTriggered': return `Crossroads: “${CROSSROADS_BY_ID[e.cardId]?.title}”`;
    case 'crisisResolved': return `${CRISES_BY_ID[e.crisisId]?.name}: ${e.success ? 'averted' : 'FAILED'} (${e.score}/${e.required}).`;
    case 'contribute': return `${pname(e.playerId)} adds a card to the crisis, face down.`;
    case 'gameOver': return `Game over: ${e.reason}.`;
    default: return null;
  }
}
