// Solo balance report (the bot plays the team).
// node scripts/balance.mjs [gamesPerRow=100] [scenarios=crawler] [difficulties=easy,normal,hard]
// Target (rework plan, Step 18): normal wins 35–50% of crawler games, and wins end on day 30–36.
import { simulate } from '../src/ai/simulate.js';

const N = Number(process.argv[2] ?? 100);
const scenarios = (process.argv[3] ?? 'crawler').split(',');
const diffs = (process.argv[4] ?? 'easy,normal,hard').split(',');
for (const scenarioId of scenarios) {
  for (const difficulty of diffs) {
    const reasons = {};
    let wins = 0, winDays = 0, lossDays = 0, errors = 0;
    for (let seed = 1; seed <= N; seed++) {
      const { state, errors: e } = simulate({ scenarioId, seed, difficulty });
      const r = state.result?.reason ?? 'unfinished';
      reasons[r] = (reasons[r] ?? 0) + 1;
      if (state.result?.won) { wins++; winDays += state.day; } else lossDays += state.day;
      errors += e.length;
    }
    const pct = Math.round((wins / N) * 100);
    const wd = wins ? (winDays / wins).toFixed(1) : '-';
    const ld = N - wins ? (lossDays / (N - wins)).toFixed(1) : '-';
    console.log(`${scenarioId.padEnd(7)} ${difficulty.padEnd(6)} won ${String(pct).padStart(3)}%  win day ${wd}  loss day ${ld}  illegal ${errors}  ${JSON.stringify(reasons)}`);
  }
}
