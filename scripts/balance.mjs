// Bot-vs-bot balance report: node scripts/balance.mjs [gamesPerCell=200]
import { simulate } from '../src/ai/simulate.js';

const N = Number(process.argv[2] ?? 200);
for (const scenarioId of ['beacon', 'stores', 'purge']) {
  for (const players of [2, 3, 4, 5]) {
    const reasons = {};
    let rounds = 0;
    let errors = 0;
    for (let seed = 1; seed <= N; seed++) {
      const { state, errors: e } = simulate({ players, scenarioId, seed });
      const r = state.result?.reason ?? 'unfinished';
      reasons[r] = (reasons[r] ?? 0) + 1;
      rounds += state.round;
      errors += e.length;
    }
    console.log(`${scenarioId.padEnd(7)} ${players}p  avg round ${(rounds / N).toFixed(1)}  illegal ${errors}  ${JSON.stringify(reasons)}`);
  }
}
