// Solo balance report (the bot plays the team): node scripts/balance.mjs [gamesPerScenario=200]
import { simulate } from '../src/ai/simulate.js';

const N = Number(process.argv[2] ?? 200);
for (const scenarioId of ['beacon', 'stores', 'purge']) {
  const reasons = {};
  let rounds = 0;
  let errors = 0;
  for (let seed = 1; seed <= N; seed++) {
    const { state, errors: e } = simulate({ scenarioId, seed });
    const r = state.result?.reason ?? 'unfinished';
    reasons[r] = (reasons[r] ?? 0) + 1;
    rounds += state.round;
    errors += e.length;
  }
  console.log(`${scenarioId.padEnd(7)} avg round ${(rounds / N).toFixed(1)}  illegal ${errors}  ${JSON.stringify(reasons)}`);
}
