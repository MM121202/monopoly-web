import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { decide } from '../src/ai/bot.js';
import { START_CASH, JAIL_INDEX } from '../src/engine/data.js';

function newGame(seed = 1, n = 2) {
  return new Game({
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isBot: true })),
    seed,
  });
}

/** 固定骰子，让依赖随机性的用例可断言 */
function stubDice(game, values) {
  let i = 0;
  game.rng.die = () => values[i++ % values.length];
}

/** 把 AI 决策变成一次真实执行（模拟器/测试共用同一套动作映射） */
function applyDecision(game, action) {
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

test('开局：每人 1500，位于起点', () => {
  const g = newGame();
  assert.equal(g.state.players.length, 2);
  for (const p of g.state.players) {
    assert.equal(p.cash, START_CASH);
    assert.equal(p.pos, 0);
    assert.equal(p.bankrupt, false);
  }
  assert.equal(g.state.phase, 'await-roll');
});

test('经过起点发放 200', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.pos = 39;
  g.moveBy(p, 3);
  assert.equal(p.pos, 2);
  assert.equal(p.cash, START_CASH + 200);
});

test('同色组齐备时基础租金翻倍', () => {
  const g = newGame();
  g.state.owner[1] = 0; // 地中海大道 60，基础租 2
  assert.equal(g.rentFor(1), 2);
  g.state.owner[3] = 0; // 补齐棕色组
  assert.equal(g.rentFor(1), 4);
});

test('同一街区内房屋数不同则租金按房屋档位', () => {
  const g = newGame();
  g.state.owner[1] = 0;
  g.state.owner[3] = 0;
  g.state.houses[1] = 2;
  assert.equal(g.rentFor(1), 30);
  g.state.houses[1] = 5;
  assert.equal(g.rentFor(1), 250);
});

test('铁路按持有条数计价', () => {
  const g = newGame();
  g.state.owner[5] = 0;
  assert.equal(g.rentFor(5), 25);
  g.state.owner[15] = 0;
  assert.equal(g.rentFor(5), 50);
  g.state.owner[25] = 0;
  assert.equal(g.rentFor(5), 100);
  g.state.owner[35] = 0;
  assert.equal(g.rentFor(5), 200);
});

test('公用事业按骰点倍数计价', () => {
  const g = newGame();
  g.state.owner[12] = 0;
  assert.equal(g.rentFor(12, 8), 32); // ×4
  g.state.owner[28] = 0;
  assert.equal(g.rentFor(12, 8), 80); // ×10
});

test('购买地产扣款并登记所有权', () => {
  const g = newGame();
  g.state.phase = 'await-buy';
  g.state.pending = { type: 'buy', idx: 1 };
  g.buy();
  assert.equal(g.state.owner[1], 0);
  assert.equal(g.state.players[0].cash, START_CASH - 60);
  assert.equal(g.state.phase, 'await-action');
});

test('放弃购买不改变资金', () => {
  const g = newGame();
  g.state.phase = 'await-buy';
  g.state.pending = { type: 'buy', idx: 1 };
  g.skipBuy();
  assert.equal(g.state.owner[1], undefined);
  assert.equal(g.state.players[0].cash, START_CASH);
});

test('建房需要整组持有，且必须均富建造', () => {
  const g = newGame();
  g.state.owner[1] = 0;
  assert.equal(g.canBuild(1), false); // 未成组
  g.state.owner[3] = 0;
  assert.equal(g.canBuild(1), true);
  g.build(1);
  assert.equal(g.state.houses[1], 1);
  assert.equal(g.canBuild(1), false); // 已比邻居多，不能继续
  assert.equal(g.canBuild(3), true);
  g.build(3);
  assert.equal(g.canBuild(1), true);
  assert.equal(g.state.players[0].cash, START_CASH - 2 * 50);
});

test('抵押后不再收租，也无法建房', () => {
  const g = newGame();
  g.state.owner[1] = 0;
  g.state.owner[3] = 0;
  g.mortgage(1);
  assert.equal(g.state.mortgaged[1], true);
  assert.equal(g.rentFor(1), 0);
  assert.equal(g.state.players[0].cash, START_CASH + 30);
  assert.equal(g.canBuild(1), false);
});

test('有房屋的地产不能抵押', () => {
  const g = newGame();
  g.state.owner[1] = 0;
  g.state.owner[3] = 0;
  g.state.houses[1] = 1;
  assert.equal(g.canMortgage(1), false);
});

test('连续三次双数直接入狱', () => {
  const g = newGame();
  const p = g.state.players[0];
  stubDice(g, [2, 2]);

  g.roll();
  assert.equal(g.state.doublesCount, 1);
  g.state.phase = 'await-roll';

  g.roll();
  assert.equal(g.state.doublesCount, 2);
  g.state.phase = 'await-roll';

  g.roll();
  assert.equal(p.inJail, true);
  assert.equal(p.pos, JAIL_INDEX);
  assert.equal(g.state.doublesCount, 0);
});

test('狱中三次未掷出双数则缴 50 出狱', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.inJail = true;
  p.pos = JAIL_INDEX;
  // 2 + 3 = 5 → 落在「宾夕法尼亚铁路」（无人拥有，不产生扣款）
  stubDice(g, [2, 3]);

  g.roll();
  assert.equal(p.jailTurns, 1);
  g.state.phase = 'await-roll';

  g.roll();
  assert.equal(p.jailTurns, 2);
  g.state.phase = 'await-roll';

  g.roll();
  assert.equal(p.inJail, false);
  assert.equal(g.state.players[0].cash, START_CASH - 50);
});

test('掷出双数可出狱并立即移动', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.inJail = true;
  p.pos = JAIL_INDEX;
  stubDice(g, [4, 4]);
  g.roll();
  assert.equal(p.inJail, false);
  assert.equal(p.pos, (JAIL_INDEX + 8) % 40);
});

test('现金为负时不能结束回合', () => {
  const g = newGame();
  g.state.players[0].cash = -1;
  g.state.phase = 'await-action';
  assert.throws(() => g.endTurn(), /变卖资产/);
});

test('破产后资产转移给债权人并出局', () => {
  const g = newGame(1, 3);
  g.state.owner[1] = 0;
  g.state.owner[3] = 0;
  g.state.players[0].cash = -300;
  g.declareBankrupt(0, 1);
  assert.equal(g.state.players[0].bankrupt, true);
  assert.equal(g.state.owner[1], 1);
  assert.equal(g.state.owner[3], 1);
  assert.equal(g.state.players[0].cash, 0);
});

test('破产后剩一名玩家即判定胜利', () => {
  const g = newGame(1, 2);
  g.state.players[0].cash = -10;
  g.declareBankrupt(0, null);
  assert.equal(g.state.phase, 'over');
  assert.equal(g.state.winner, 1);
});

test('同种子产生完全相同的骰子序列', () => {
  const seq = (seed) => {
    const g = newGame(seed);
    const out = [];
    for (let i = 0; i < 12; i++) {
      g.state.phase = 'await-roll';
      g.state.players[0].inJail = false;
      g.roll();
      out.push(g.state.dice.join(','));
    }
    return out;
  };
  assert.deepEqual(seq(4242), seq(4242));
  assert.notDeepEqual(seq(4242), seq(9999));
});

test('经过起点在卡牌移动时也发放工资', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.pos = 36;
  g.moveTo(p, 5, { salary: true });
  assert.equal(p.cash, START_CASH + 200);
  assert.equal(p.pos, 5);
});

test('维修卡按房屋与酒店分别计价', () => {
  const g = newGame();
  const p = g.state.players[0];
  g.state.owner[1] = 0;
  g.state.owner[3] = 0;
  g.state.houses[1] = 5; // 酒店
  g.state.houses[3] = 2; // 2 栋
  g.applyCard(p, { kind: 'repairs', perHouse: 25, perHotel: 100 });
  assert.equal(p.cash, START_CASH - (100 + 50));
});

// ---------------------------------------------------------------- 存档 / 可序列化
test('快照包含 RNG 游标、牌堆与回合上限', () => {
  const g = new Game({
    players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
    seed: 5,
    maxTurns: 77,
  });
  const s = g.snapshot();
  assert.ok(s.rng && typeof s.rng.state === 'number', 'RNG 游标应在快照里');
  assert.equal(s.decks.chance.length, 14);
  assert.equal(s.decks.chest.length, 16);
  assert.deepEqual(s.deckIndex, { chance: 0, chest: 0 });
  assert.equal(s.maxTurns, 77, '回合上限也应在快照里');
});

test('AC-S1：存读档后连续掷 100 次骰子序列完全一致', () => {
  const mk = () => new Game({
    players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
    seed: 777,
  });
  const a = mk();
  // 先走几步，制造非初始状态（RNG 已推进过）
  for (let i = 0; i < 5; i++) {
    a.state.phase = 'await-roll';
    a.state.players[0].inJail = false;
    a.roll();
  }

  const b = mk().restore(a.snapshot());

  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 100; i++) {
    for (const [g, out] of [[a, seqA], [b, seqB]]) {
      g.state.phase = 'await-roll';
      g.state.players[0].inJail = false;
      g.roll();
      out.push(g.state.dice.join(','));
    }
  }
  assert.deepEqual(seqA, seqB);
  assert.equal(new Set(seqA).size > 1, true, '骰子序列不应是常量');
});

test('AC-S1b：存读档后抽牌序列完全一致', () => {
  const a = new Game({
    players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
    seed: 4242,
  });
  const b = new Game({
    players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
    seed: 4242,
  }).restore(a.snapshot());

  const draw = (g) => {
    const c = g.state.decks.chance[g.state.deckIndex.chance % g.state.decks.chance.length];
    g.state.deckIndex.chance += 1;
    return c.id;
  };
  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 20; i++) {
    seqA.push(draw(a));
    seqB.push(draw(b));
  }
  assert.deepEqual(seqA, seqB);
  assert.equal(seqA.length, 20);
});

test('快照是纯数据，可 JSON 往返且不含实例字段', () => {
  const g = newGame();
  g.state.phase = 'await-roll';
  g.roll();
  const round = JSON.parse(JSON.stringify(g.snapshot()));
  assert.equal(round.rng.state, g.state.rng.state);
  assert.equal(Object.hasOwn(round, 'subs'), false);
  assert.equal(Object.hasOwn(round, 'rng'), true);
});

// ---------------------------------------------------------------- 缺陷回归
test('净资产计入抵押地产的可回收价值', () => {
  const g = newGame();
  g.state.owner[1] = 0;                       // 地中海大道 60
  g.state.players[0].cash = START_CASH;
  g.state.mortgaged[1] = true;                // 直接置抵押，不改现金
  assert.equal(g.netWorth(g.state.players[0]), START_CASH + 30);
});

test('整圈移动同样经过起点发薪', () => {
  const g = newGame();
  const p = g.state.players[0];
  g.moveBy(p, 40);
  assert.equal(p.pos, 0);
  assert.equal(p.cash, START_CASH + 200);
});

test('后退移动不发放起点薪水', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.pos = 5;
  g.moveBy(p, -3);
  assert.equal(p.pos, 2);
  assert.equal(p.cash, START_CASH);
});

test('无人存活时回合上限也明确收口', () => {
  const g = new Game({
    players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }],
    seed: 1,
    maxTurns: 3,
  });
  g.state.turn = 4;
  g.state.players.forEach((p) => { p.bankrupt = true; });
  assert.equal(g.turnLimitReached(), true);
  assert.equal(g.state.phase, 'over');
  assert.equal(g.state.winner, null);
});

test('免费停车落地无任何效果', () => {
  const g = newGame();
  const p = g.state.players[0];
  p.pos = 19;
  p.cash = START_CASH;
  stubDice(g, [1, 0]); // 1+0 = 1 → 落在 20 免费停车
  g.state.phase = 'await-roll';
  g.roll();
  assert.equal(p.pos, 20);
  assert.equal(p.cash, START_CASH, '免费停车不应发奖金也不应扣款');
});

// ---------------------------------------------------------------- AI 决策
test('AI 决策在主要相位都返回可执行动作', () => {
  const g = newGame();
  g.state.phase = 'await-roll';
  const a1 = decide(g);
  assert.ok(a1 && ['roll', 'useJailCard', 'payJailFine'].includes(a1.action));

  g.state.phase = 'await-buy';
  g.state.pending = { type: 'buy', idx: 1 };
  const a3 = decide(g);
  assert.ok(a3 && ['buy', 'skipBuy'].includes(a3.action));

  g.state.phase = 'await-action';
  const a4 = decide(g);
  assert.ok(a4 && ['build', 'unmortgage', 'endTurn', 'bankrupt', 'noop', 'useJailCard', 'payJailFine'].includes(a4.action));
});

test('完整 bot 对局能在回合上限内结束（冒烟）', () => {
  const g = new Game({
    players: [
      { name: 'A', isBot: true },
      { name: 'B', isBot: true },
      { name: 'C', isBot: true },
    ],
    seed: 2024,
    maxTurns: 60,
  });
  let steps = 0;
  while (g.state.phase !== 'over' && steps < 5000) {
    steps += 1;
    const action = decide(g);
    if (!action) break;
    applyDecision(g, action); // 任何引擎异常都会在这里直接抛出
  }
  assert.equal(g.state.phase, 'over');
  assert.ok(g.state.winner !== null && g.state.winner !== undefined);
  assert.ok(steps < 5000, '不应触发步数保险丝');
});

test('同一 seed 的完整对局结果可复现', () => {
  const run = (seed) => {
    const g = new Game({
      players: [
        { name: 'A', isBot: true },
        { name: 'B', isBot: true },
      ],
      seed,
      maxTurns: 60,
    });
    let steps = 0;
    while (g.state.phase !== 'over' && steps < 5000) {
      steps += 1;
      const action = decide(g);
      if (!action) break;
      applyDecision(g, action);
    }
    return `${g.state.phase}:${g.state.winner}:${g.state.turn}:${g.state.players.map((p) => p.cash).join(',')}`;
  };
  assert.equal(run(31337), run(31337));
});
