import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
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
  g.defaultCreditor = 1;
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
  g.applyCard(p, { kind: 'repairs', perHouse: 25, perHotel: 100 }, 'chance');
  assert.equal(p.cash, START_CASH - (100 + 50));
});
