/**
 * 无头自对弈模拟 —— 用于验证规则收敛与 AI 行为是否合理。
 * 运行：node scripts/simulate.mjs [局数] [玩家数]
 *
 * 它回答三个问题：
 *   1. 对局能不能结束（不会出现所有人互相 pass 的死循环）
 *   2. AI 会不会真的建房、抵押、破产
 *   3. 平均回合数是否在合理区间
 *
 * 另外会报告「撞上限判胜占比」——这一项才反映对局是否**自然收束**。
 * 「未结束 = 0」只说明回合上限在工作，不代表对局质量好。
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
  capWins: 0, // 撞回合上限判胜的局数（越少说明对局越能自然收束）
};

for (let g = 0; g < GAMES; g++) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ name: `P${i + 1}`, isBot: true }));
  const game = new Game({ players, seed: 1000 + g });
  let steps = 0;

  while (game.state.phase !== 'over' && steps < 30000) {
    steps += 1;
    const action = decide(game);
    if (!action) break;
    // fail-fast：引擎/决策异常直接抛出并带上上下文。
    // 旧实现用 try/catch 把异常吞掉再强行续局，会让「异常次数」这个指标失真、
    // 并掩盖真实 bug —— 这里改成让它显式炸出来。
    try {
      apply(game, action);
    } catch (err) {
      throw new Error(
        `模拟异常（第 ${g} 局 · 第 ${steps} 步 · 动作 ${action.action} · 相位 ${game.state.phase}）：${err.message}`,
      );
    }
  }

  if (game.state.phase !== 'over') {
    summary.unfinished += 1;
  } else {
    summary.rounds.push(game.state.turn);
    // endTurn 会先把 turn +1 再判上限，因此 turn > maxTurns 即撞上限判胜
    if (game.state.turn > game.state.maxTurns) summary.capWins += 1;
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
const pct = (a, total) => (total ? ((a / total) * 100).toFixed(1) + '%' : '—');

console.log(`局数 ${GAMES} · 人数 ${PLAYERS}`);
console.log(`已分出胜负: ${summary.rounds.length} / ${GAMES}   未结束: ${summary.unfinished}`);
console.log(`撞上限判胜: ${summary.capWins} / ${GAMES}（${pct(summary.capWins, GAMES)}）`);
console.log(`平均回合: ${avg(summary.rounds)}   最长: ${max(summary.rounds)}`);
console.log(`平均建房数: ${avg(summary.houses)}   最多: ${max(summary.houses)}`);
console.log(`平均抵押数: ${avg(summary.mortgaged)}`);
console.log(`平均破产人数: ${avg(summary.bankrupt)}`);
