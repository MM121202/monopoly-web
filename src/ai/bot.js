import { BOARD, GROUPS, JAIL_FINE, MAX_HOUSES } from '../engine/data.js';

/**
 * AI 决策 —— 纯函数：吃当前状态，吐一个动作描述。
 * UI 负责按节奏执行，所以这里不做任何计时或 DOM 操作。
 *
 * 策略取向：稳健型。
 *  - 保留安全现金垫，避免为了买地把自己逼到破产
 *  - 优先补齐同色组（这是收租翻倍的唯一途径）
 *  - 富余现金流向房屋，尤其是已经成组的街区
 *
 * 策略阈值集中在下方，调参只改这里。
 */

/** 开局保护期：前 N 回合更保守，先把棋盘铺开 */
const EARLY_TURN = 12;
/** 非补组买地的现金垫：早期 120 / 后期 200（后期租金压力更大，要多留） */
const RESERVE_EARLY = 120;
const RESERVE_LATE = 200;
/** 现金低于此值不建房（保命优先） */
const BUILD_CASH = 240;
/** 建完房至少要剩下的现金 */
const BUILD_KEEP = 90;
/** 赎回抵押后至少要剩下的现金 */
const UNMORTGAGE_KEEP = 600;
/** 自动付保释金的现金线：await-roll 更激进一点，await-action 更保守 */
const JAIL_FINE_CASH_ROLL = 300;
const JAIL_FINE_CASH_ACTION = 250;

export function decide(game) {
  const s = game.state;
  const me = game.cur();
  if (!me || me.bankrupt || s.phase === 'over') return null;

  if (s.phase === 'await-roll') {
    if (me.inJail) {
      if (me.jailCards > 0) return { action: 'useJailCard' };
      if (me.cash > JAIL_FINE_CASH_ROLL) return { action: 'payJailFine' };
    }
    return { action: 'roll' };
  }

  if (s.phase === 'await-buy') {
    const idx = s.pending.idx;
    const sq = BOARD[idx];
    const reserve = s.turn < EARLY_TURN ? RESERVE_EARLY : RESERVE_LATE;
    const completesGroup = (GROUPS.get(sq.group) ?? [])
      .filter((i) => i !== idx)
      .every((i) => s.owner[i] === me.id);
    // 补齐整组是唯一能把租金翻倍的路径，值得压上大部分现金
    const affordable = completesGroup
      ? me.cash >= sq.price
      : sq.price <= me.cash - reserve;
    return { action: affordable ? 'buy' : 'skipBuy' };
  }

  if (s.phase === 'await-action') {
    // 1) 现金为负：先自救，实在不行就破产
    if (me.cash < 0) {
      const ok = game.raiseFunds(me.id, 0);
      if (!ok || me.cash < 0) {
        const creditor = findCreditor(game, me);
        return { action: 'bankrupt', args: [me.id, creditor] };
      }
      return { action: 'noop' };
    }

    // 2) 出狱：有卡用卡，有钱付保释金
    if (me.inJail) {
      if (me.jailCards > 0) return { action: 'useJailCard' };
      if (me.cash > JAIL_FINE_CASH_ACTION) return { action: 'payJailFine' };
      return { action: 'endTurn' };
    }

    // 3) 建房：成组之后立刻把现金转成租金，这是唯一能逼对手破产的手段
    const buildable = BUILDABLE(game, me);
    if (buildable.length && me.cash > BUILD_CASH) {
      buildable.sort((a, b) => {
        const ha = game.housesOn(a);
        const hb = game.housesOn(b);
        if (ha !== hb) return ha - hb;
        return BOARD[b].price - BOARD[a].price;
      });
      const idx = buildable[0];
      if (me.cash - BOARD[idx].house > BUILD_KEEP) return { action: 'build', args: [idx] };
    }

    // 4) 赎回：现金充裕时把抵押的地拿回来
    for (const [idx, owner] of Object.entries(s.owner)) {
      if (owner !== me.id) continue;
      const i = Number(idx);
      if (!s.mortgaged[i]) continue;
      const cost = Math.ceil(BOARD[i].price / 2 * 1.1);
      if (me.cash - cost > UNMORTGAGE_KEEP) return { action: 'unmortgage', args: [i] };
    }

    return { action: 'endTurn' };
  }

  return null;

  function BUILDABLE(g, player) {
    const out = [];
    for (const sq of BOARD) {
      if (sq.type !== 'prop') continue;
      if (s.owner[sq.i] !== player.id) continue;
      if (!g.groupFull(sq.group, player.id)) continue;
      if (g.housesOn(sq.i) >= MAX_HOUSES) continue;
      const min = Math.min(...GROUPS.get(sq.group).map((i) => g.housesOn(i)));
      if (g.housesOn(sq.i) > min) continue;
      if (s.mortgaged[sq.i]) continue;
      if (GROUPS.get(sq.group).some((i) => s.mortgaged[i])) continue;
      out.push(sq.i);
    }
    return out;
  }
}

function findCreditor(game, me) {
  // 简易判断：资产最多的对手最有可能是债权人
  let best = null;
  for (const p of game.state.players) {
    if (p.id === me.id || p.bankrupt) continue;
    if (!best || game.netWorth(p) > game.netWorth(best)) best = p;
  }
  return best ? best.id : null;
}
