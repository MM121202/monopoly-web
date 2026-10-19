/**
 * 无头自对弈模拟 —— 用于验证规则收敛与 AI 行为是否合理。
 * 运行：node scripts/simulate.mjs [局数] [玩家数]
 *
 * 它回答三个问题：
 *   1. 对局能不能结束（不会出现所有人互相 pass 的死循环）
 *   2. AI 会不会真的建房、抵押、破产
 *   3. 平均回合数是否在合理区间
 */
import { Game } from '../src/engine/game.js';
import { decide } from '../src/ai/bot.js';
import { BOARD } from '../src/engine/data.js';

const GAMES = Number(process.argv[2] ?? 20);
const PLAYERS = Number(process.argv[3] ?? 4);

function apply(game, action) {
  switch (action.action) {
    case 'roll': return game.roll();
    case 'buy': return game.buy();
    case 'skipBuy': return game.skipBuy();
    case 'build': return game.build(action.args[0]);
    case 'sellHouse': return game.sellHouse(action.args[0]);
    case 'mortgage': return game.mortgage(action.args[0]);
    case 'unmortgage': return game.unmortgage(action.args[0]);
    case 'useJailCard': return game.useJailCard();
    case 'payJailFine': return game.payJailFine();
    case 'bankrupt': return game.declareBankrupt(action.args[0], action.args[1]);
    case 'endTurn': return game.endTurn();
    case 'noop': return undefined;
    default: throw new Error(`未知动作 ${action.action}`);
  }
}

const summary = {
  rounds: [],
  houses: [],
  mortgaged: [],
  bankrupt: [],
  unfinished: 0,
  errors: [],
};

for (let g = 0; g < GAMES; g++) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ name: `P${i + 1}`, isBot: true }));
  const game = new Game({ players, seed: 1000 + g });
  let steps = 0;

  while (game.state.phase !== 'over' && steps < 30000) {
    steps += 1;
    const action = decide(game);
    if (!action) break;
    try {
      apply(game, action);
    } catch (err) {
      summary.errors.push(`${g}:${action.action}: ${err.message}`);
      game.state.phase = 'await-action';
      if (game.cur().cash < 0) game.declareBankrupt(game.cur().id, null);
      else game.endTurn();
    }
  }

  if (game.state.phase !== 'over') {
    summary.unfinished += 1;
  } else {
    summary.rounds.push(game.state.turn);
  }

  const houses = Object.entries(game.state.houses).reduce((n, [idx, h]) => {
    return n + (BOARD[Number(idx)]?.type === 'prop' ? h : 0);
  }, 0);
  summary.houses.push(houses);
  summary.mortgaged.push(Object.values(game.state.mortgaged).filter(Boolean).length);
  summary.bankrupt.push(game.state.players.filter((p) => p.bankrupt).length);
}

const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '—');
const max = (a) => (a.length ? Math.max(...a) : '—');

console.log(`局数 ${GAMES} · 人数 ${PLAYERS}`);
console.log(`已分出胜负: ${summary.rounds.length} / ${GAMES}   未结束: ${summary.unfinished}`);
console.log(`平均回合: ${avg(summary.rounds)}   最长: ${max(summary.rounds)}`);
console.log(`平均建房数: ${avg(summary.houses)}   最多: ${max(summary.houses)}`);
console.log(`平均抵押数: ${avg(summary.mortgaged)}`);
console.log(`平均破产人数: ${avg(summary.bankrupt)}`);
if (summary.errors.length) {
  console.log(`异常 ${summary.errors.length} 次:`);
  for (const e of summary.errors.slice(0, 8)) console.log('  ' + e);
}
