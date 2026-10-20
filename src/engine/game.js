import {
  BOARD, GROUPS, JAIL_INDEX, GO_SALARY, JAIL_FINE,
  START_CASH, MAX_HOUSES, railRent, utilMultiplier,
} from './data.js';
import { CHANCE, CHEST } from './cards.js';
import { Rng } from './rng.js';

const DECK_CHANCE = 'chance';
const DECK_CHEST = 'chest';

/**
 * 规则引擎 —— 纯逻辑，不碰 DOM。
 * 所有可变状态集中在 this.state，UI 通过 snapshot() 读取。
 * 每个动作结束后派发一次 'update'，UI 据此整树重绘。
 */
export class Game {
  constructor({ players, seed = 20261019, maxTurns = 150 } = {}) {
    if (!players || players.length < 2) throw new Error('至少需要 2 名玩家');
    if (players.length > 4) throw new Error('最多支持 4 名玩家');

    // 所有可变状态都集中在 this.state —— 包括 RNG 游标、洗好的牌堆、牌堆游标
    // 和回合上限。只有这样 JSON.stringify(state) 才是完整对局，
    // 读档后才能与中断前逐字节一致（见 snapshot/restore）。
    this.state = {
      seed,
      maxTurns,
      rng: { seed: seed >>> 0 },          // Rng 会就地写回 cursor.state
      decks: { chance: [], chest: [] },   // 洗牌结果必须进状态，否则读档会重新洗牌
      deckIndex: { chance: 0, chest: 0 }, // 牌堆游标同理
      players: players.map((p, idx) => ({
        id: idx,
        name: p.name ?? `玩家 ${idx + 1}`,
        isBot: !!p.isBot,
        color: p.color ?? ['#e4584c', '#3aa0ff', '#3fbf7f', '#f0b429'][idx % 4],
        cash: START_CASH,
        pos: 0,
        inJail: false,
        jailTurns: 0,
        jailCards: 0,
        bankrupt: false,
      })),
      owner: {},       // square -> playerId
      houses: {},      // square -> 0..5
      mortgaged: {},   // square -> bool
      current: 0,
      dice: [0, 0],
      doublesCount: 0,
      extraRoll: false,
      phase: 'await-roll',
      pending: null,   // { type: 'buy', idx }
      turn: 1,
      winner: null,
      log: [],
    };

    // Rng 持有 state.rng 的引用：每次掷骰自动把游标写回可序列化状态
    this.rng = new Rng(this.state.rng);
    this.state.decks = {
      chance: this.rng.shuffle(CHANCE),
      chest: this.rng.shuffle(CHEST),
    };
    this.subs = new Set();

    this.log(`对局开始，共 ${players.length} 名玩家，起始资金 ${START_CASH}`);
  }

  /** 回合上限存在 state 里（读档需要），这里保留便捷访问 */
  get maxTurns() {
    return this.state.maxTurns;
  }

  set maxTurns(v) {
    this.state.maxTurns = v;
  }

  // ---------------------------------------------------------------- 订阅
  subscribe(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  emit(event = 'update') {
    for (const fn of this.subs) fn(event, this.state);
  }

  log(text, kind = 'info') {
    this.state.log.push({ turn: this.state.turn, text, kind });
    if (this.state.log.length > 200) this.state.log.shift();
  }

  // ---------------------------------------------------------------- 查询
  cur() {
    return this.state.players[this.state.current];
  }

  alive() {
    return this.state.players.filter((p) => !p.bankrupt);
  }

  ownerOf(idx) {
    const id = this.state.owner[idx];
    return id === undefined ? null : this.state.players[id];
  }

  housesOn(idx) {
    return this.state.houses[idx] ?? 0;
  }

  ownedInGroup(group) {
    const ids = GROUPS.get(group) ?? [];
    const me = this.state.owner;
    return ids.filter((i) => me[i] === this.cur().id).length;
  }

  groupFull(group, playerId) {
    const ids = GROUPS.get(group) ?? [];
    return ids.every((i) => this.state.owner[i] === playerId);
  }

  countType(type, playerId) {
    return BOARD.filter((sq) => sq.type === type && this.state.owner[sq.i] === playerId).length;
  }

  /** 租金计算：房产 / 铁路 / 公用事业 三套规则 */
  rentFor(idx, diceTotal = 7) {
    const sq = BOARD[idx];
    const owner = this.state.owner[idx];
    if (owner === undefined || this.state.mortgaged[idx]) return 0;

    if (sq.type === 'prop') {
      const h = this.housesOn(idx);
      if (h > 0) return sq.rent[h];
      return this.groupFull(sq.group, owner) ? sq.rent[0] * 2 : sq.rent[0];
    }
    if (sq.type === 'rail') return railRent(this.countType('rail', owner));
    if (sq.type === 'util') return utilMultiplier(this.countType('util', owner)) * diceTotal;
    return 0;
  }

  netWorth(p) {
    let total = p.cash;
    for (const [idx, owner] of Object.entries(this.state.owner)) {
      if (owner !== p.id) continue;
      const i = Number(idx);
      const sq = BOARD[i];
      // 抵押地产仍有可回收价值（赎回价为面值一半的 110%），按一半计入，
      // 否则回合上限按净资产判胜时会系统性低估抵押过资产的玩家。
      total += Math.floor(sq.price / 2);
      if (sq.type === 'prop') total += this.housesOn(i) * Math.floor(sq.house / 2);
    }
    return total;
  }

  /** 可用于变现的资产清单，UI 与 AI 都用它 */
  assetsOf(playerId) {
    const houses = [];
    const mortgages = [];
    for (const [idx, owner] of Object.entries(this.state.owner)) {
      if (owner !== playerId) continue;
      const i = Number(idx);
      if (this.housesOn(i) > 0) houses.push(i);
      if (!this.state.mortgaged[i]) mortgages.push(i);
    }
    return { houses, mortgages };
  }

  canRaise(playerId) {
    const { houses, mortgages } = this.assetsOf(playerId);
    return houses.length > 0 || mortgages.length > 0;
  }

  /** 该地块是否满足建房条件（均富建房 + 满组 + 未抵押） */
  canBuild(idx) {
    const sq = BOARD[idx];
    if (sq.type !== 'prop') return false;
    if (this.state.owner[idx] !== this.cur().id) return false;
    if (this.state.mortgaged[idx]) return false;
    if (this.housesOn(idx) >= MAX_HOUSES) return false;
    if (!this.groupFull(sq.group, this.cur().id)) return false;
    const minHouses = Math.min(...GROUPS.get(sq.group).map((i) => this.housesOn(i)));
    if (this.housesOn(idx) > minHouses) return false;

    // 同色组内存在抵押时不能建房
    const groupIds = GROUPS.get(sq.group);
    if (groupIds.some((i) => this.state.mortgaged[i])) return false;

    const cost = sq.house;
    return this.cur().cash >= cost;
  }

  canSellHouse(idx) {
    const sq = BOARD[idx];
    if (sq.type !== 'prop' || this.housesOn(idx) === 0) return false;
    if (this.state.owner[idx] !== this.cur().id) return false;
    const maxHouses = Math.max(...GROUPS.get(sq.group).map((i) => this.housesOn(i)));
    return this.housesOn(idx) === maxHouses;
  }

  canMortgage(idx) {
    return this.state.owner[idx] === this.cur().id
      && !this.state.mortgaged[idx]
      && this.housesOn(idx) === 0;
  }

  canUnmortgage(idx) {
    const sq = BOARD[idx];
    if (this.state.owner[idx] !== this.cur().id) return false;
    if (!this.state.mortgaged[idx]) return false;
    return this.cur().cash >= Math.ceil(sq.price / 2 * 1.1);
  }

  // ---------------------------------------------------------------- 金钱
  receive(p, amount, reason) {
    p.cash += amount;
    this.log(`${p.name} 收入 ${amount}${reason ? `（${reason}）` : ''}`, 'money');
  }

  /** 扣款；不足时允许负现金，由玩家变卖或在 endTurn 前宣布破产 */
  charge(p, amount, creditor = null, reason) {
    p.cash -= amount;
    if (creditor && creditor.id !== p.id) creditor.cash += amount;
    this.log(
      `${p.name} 支付 ${amount}${creditor ? ` 给 ${creditor.name}` : ' 给银行'}${reason ? `（${reason}）` : ''}`,
      'money',
    );
  }

  // ---------------------------------------------------------------- 回合
  roll() {
    const p = this.cur();
    if (this.state.phase !== 'await-roll') throw new Error('当前阶段不能掷骰');

    const d1 = this.rng.die();
    const d2 = this.rng.die();
    const total = d1 + d2;
    const isDouble = d1 === d2;
    this.state.dice = [d1, d2];
    this.log(`${p.name} 掷出 ${d1} + ${d2} = ${total}${isDouble ? '（双数）' : ''}`, 'dice');

    this.state.extraRoll = false;

    if (p.inJail) {
      this.resolveJailRoll(p, isDouble, total);
      this.emit();
      return;
    }

    if (isDouble) {
      this.state.doublesCount += 1;
      if (this.state.doublesCount === 3) {
        this.log(`${p.name} 连续三次双数，直接入狱`, 'jail');
        this.sendToJail(p);
        this.state.phase = 'await-action';
        this.emit();
        return;
      }
      this.state.extraRoll = true;
    }

    this.moveBy(p, total);
    this.landOn(p, total);
    this.afterLanding();
    this.emit();
  }

  resolveJailRoll(p, isDouble, total) {
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      this.log(`${p.name} 掷出双数，出狱`, 'jail');
      this.moveBy(p, total);
      this.landOn(p, total);
      this.afterLanding();
      return;
    }
    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
      this.log(`${p.name} 三次未掷出双数，缴纳 ${JAIL_FINE} 出狱`, 'jail');
      this.charge(p, JAIL_FINE, null, '保释金');
      p.inJail = false;
      p.jailTurns = 0;
      this.moveBy(p, total);
      this.landOn(p, total);
      this.afterLanding();
      return;
    }
    this.log(`${p.name} 在狱中未掷出双数（第 ${p.jailTurns} 次）`, 'jail');
    this.state.phase = 'await-action';
  }

  moveBy(p, steps) {
    const from = p.pos;
    // 越过起点即发薪（含整圈）：用「起点距离」判断，比比较落点更可靠，
    // 也覆盖 steps === BOARD.length 的整圈情况。后退（steps<0）不发。
    if (steps > 0 && from + steps >= BOARD.length) {
      this.receive(p, GO_SALARY, '经过起点');
    }
    p.pos = (((from + steps) % BOARD.length) + BOARD.length) % BOARD.length;
  }

  moveTo(p, idx, { salary = false } = {}) {
    if (salary && idx <= p.pos) this.receive(p, GO_SALARY, '经过起点');
    p.pos = idx;
  }

  sendToJail(p) {
    p.pos = JAIL_INDEX;
    p.inJail = true;
    p.jailTurns = 0;
    this.state.doublesCount = 0;
    this.state.extraRoll = false;
  }

  landOn(p, diceTotal) {
    const sq = BOARD[p.pos];
    this.log(`${p.name} 停在「${sq.name}」`, 'move');

    if (sq.type === 'prop' || sq.type === 'rail' || sq.type === 'util') {
      this.landOnProperty(p, sq, diceTotal);
      return;
    }
    if (sq.type === 'tax') {
      const amount = sq.name === '奢侈税' ? 100 : 200;
      this.charge(p, amount, null, sq.name);
      return;
    }
    if (sq.type === 'gotojail') {
      this.log(`${p.name} 踩中「入狱」，直接进监狱`, 'jail');
      this.sendToJail(p);
      return;
    }
    if (sq.type === 'chance') {
      this.drawCard(p, DECK_CHANCE);
      return;
    }
    if (sq.type === 'chest') {
      this.drawCard(p, DECK_CHEST);
    }
  }

  landOnProperty(p, sq, diceTotal) {
    const owner = this.ownerOf(sq.i);
    if (!owner) {
      if (p.cash >= sq.price) {
        this.state.pending = { type: 'buy', idx: sq.i };
        this.state.phase = 'await-buy';
        return;
      }
      this.log(`${p.name} 资金不足，无法购买「${sq.name}」`, 'warn');
      return;
    }
    if (owner.id === p.id) {
      this.log(`「${sq.name}」是自己的地产`, 'move');
      return;
    }
    if (this.state.mortgaged[sq.i]) {
      this.log(`「${sq.name}」已抵押，免租`, 'move');
      return;
    }
    if (p.inJail) return;

    const rent = this.rentFor(sq.i, diceTotal);
    this.charge(p, rent, owner, `「${sq.name}」租金`);
  }

  /** 落地结算完成后的阶段推进 */
  afterLanding() {
    if (this.state.phase === 'await-buy') return;
    const p = this.cur();
    if (this.state.extraRoll && !p.inJail && !p.bankrupt) {
      this.state.phase = 'await-roll';
    } else {
      this.state.phase = 'await-action';
    }
  }

  // ---------------------------------------------------------------- 卡牌
  drawCard(p, deckName) {
    const deck = this.state.decks[deckName];
    const card = deck[this.state.deckIndex[deckName] % deck.length];
    this.state.deckIndex[deckName] += 1;
    this.log(`${p.name} 抽到${deckName === DECK_CHANCE ? '机会' : '命运'}：${card.text}`, 'card');
    this.applyCard(p, card);

    // 卡牌可能触发新的落地结算（例如前进到某地块）
    if (this.state.phase === 'await-buy') return;
  }

  applyCard(p, card) {
    switch (card.kind) {
      case 'moveTo':
        this.moveTo(p, card.to, { salary: card.salary });
        this.landOn(p, this.state.dice[0] + this.state.dice[1]);
        break;
      case 'nearest': {
        const target = card.target === 'rail' ? 'rail' : 'util';
        const idx = this.findNext(p.pos, target);
        this.moveTo(p, idx, { salary: true });
        const owner = this.ownerOf(idx);
        if (!owner) {
          if (p.cash >= BOARD[idx].price) {
            this.state.pending = { type: 'buy', idx };
            this.state.phase = 'await-buy';
          }
        } else if (owner.id !== p.id) {
          let rent = target === 'rail'
            ? railRent(this.countType('rail', owner.id))
            : utilMultiplier(this.countType('util', owner.id)) * (this.state.dice[0] + this.state.dice[1]);
          if (card.doubleRent) rent *= 2;
          this.charge(p, rent, owner, `「${BOARD[idx].name}」租金`);
        }
        break;
      }
      case 'collect':
        this.receive(p, card.amount, '卡牌');
        break;
      case 'pay':
        this.charge(p, card.amount, null, '卡牌');
        break;
      case 'collectEach': {
        for (const other of this.alive()) {
          if (other.id === p.id) continue;
          other.cash -= card.amount;
          p.cash += card.amount;
        }
        this.log(`${p.name} 向其他玩家各收取 ${card.amount}`, 'money');
        break;
      }
      case 'payEach': {
        for (const other of this.alive()) {
          if (other.id === p.id) continue;
          p.cash -= card.amount;
          other.cash += card.amount;
        }
        this.log(`${p.name} 向其他玩家各支付 ${card.amount}`, 'money');
        break;
      }
      case 'jailCard':
        p.jailCards += 1;
        break;
      case 'jail':
        this.sendToJail(p);
        break;
      case 'back': {
        p.pos = (p.pos - card.steps + BOARD.length) % BOARD.length;
        this.landOn(p, this.state.dice[0] + this.state.dice[1]);
        break;
      }
      case 'repairs': {
        let cost = 0;
        for (const [idx, owner] of Object.entries(this.state.owner)) {
          if (owner !== p.id) continue;
          const h = this.housesOn(Number(idx));
          if (h === 5) cost += card.perHotel;
          else cost += h * card.perHouse;
        }
        if (cost > 0) this.charge(p, cost, null, '维修费');
        else this.log('没有需要维修的房屋');
        break;
      }
      default:
        this.log(`未实现的卡牌类型：${card.kind}`, 'warn');
    }
  }

  findNext(from, type) {
    for (let step = 1; step <= BOARD.length; step++) {
      const idx = (from + step) % BOARD.length;
      if (BOARD[idx].type === type) return idx;
    }
    return from;
  }

  // ---------------------------------------------------------------- 决策
  buy() {
    const { pending, phase } = this.state;
    if (phase !== 'await-buy' || !pending) throw new Error('当前没有待购买的资产');
    const p = this.cur();
    const sq = BOARD[pending.idx];
    if (p.cash < sq.price) throw new Error('资金不足');

    p.cash -= sq.price;
    this.state.owner[pending.idx] = p.id;
    this.state.houses[pending.idx] = 0;
    this.log(`${p.name} 以 ${sq.price} 购得「${sq.name}」`, 'buy');
    this.state.pending = null;
    this.state.phase = 'await-action';
    this.afterLanding();
    this.emit();
  }

  skipBuy() {
    if (this.state.phase !== 'await-buy') throw new Error('当前没有待购买的资产');
    const sq = BOARD[this.state.pending.idx];
    this.log(`${this.cur().name} 放弃购买「${sq.name}」`, 'warn');
    this.state.pending = null;
    this.state.phase = 'await-action';
    this.afterLanding();
    this.emit();
  }

  build(idx) {
    if (!this.canBuild(idx)) throw new Error(`无法在「${BOARD[idx].name}」建房`);
    const sq = BOARD[idx];
    const p = this.cur();
    p.cash -= sq.house;
    this.state.houses[idx] = this.housesOn(idx) + 1;
    const label = this.state.houses[idx] === MAX_HOUSES ? '酒店' : `${this.state.houses[idx]} 栋房屋`;
    this.log(`${p.name} 在「${sq.name}」建造${label}，花费 ${sq.house}`, 'build');
    this.emit();
  }

  sellHouse(idx) {
    if (!this.canSellHouse(idx)) throw new Error(`无法在「${BOARD[idx].name}」卖房`);
    const sq = BOARD[idx];
    const p = this.cur();
    const refund = Math.floor(sq.house / 2);
    this.state.houses[idx] = this.housesOn(idx) - 1;
    p.cash += refund;
    this.log(`${p.name} 卖出「${sq.name}」的一栋房屋，获得 ${refund}`, 'build');
    this.emit();
  }

  mortgage(idx) {
    if (!this.canMortgage(idx)) throw new Error(`无法抵押「${BOARD[idx].name}」`);
    const sq = BOARD[idx];
    const p = this.cur();
    const value = Math.floor(sq.price / 2);
    this.state.mortgaged[idx] = true;
    p.cash += value;
    this.log(`${p.name} 抵押「${sq.name}」，获得 ${value}`, 'money');
    this.emit();
  }

  unmortgage(idx) {
    if (!this.canUnmortgage(idx)) throw new Error(`无法赎回「${BOARD[idx].name}」`);
    const sq = BOARD[idx];
    const p = this.cur();
    const cost = Math.ceil(sq.price / 2 * 1.1);
    p.cash -= cost;
    this.state.mortgaged[idx] = false;
    this.log(`${p.name} 赎回「${sq.name}」，支付 ${cost}`, 'money');
    this.emit();
  }

  payJailFine() {
    const p = this.cur();
    if (!p.inJail) throw new Error('当前不在监狱');
    if (p.cash < JAIL_FINE) throw new Error('现金不足');
    this.charge(p, JAIL_FINE, null, '保释金');
    p.inJail = false;
    p.jailTurns = 0;
    this.log(`${p.name} 缴纳保释金出狱`, 'jail');
    this.emit();
  }

  useJailCard() {
    const p = this.cur();
    if (!p.inJail || p.jailCards <= 0) throw new Error('没有出狱许可证');
    p.jailCards -= 1;
    p.inJail = false;
    p.jailTurns = 0;
    this.log(`${p.name} 使用出狱许可证离开监狱`, 'jail');
    this.emit();
  }

  endTurn() {
    const p = this.cur();
    if (this.state.phase === 'await-buy') throw new Error('请先决定是否购买');
    if (p.cash < 0) throw new Error('现金为负，请先变卖资产或宣布破产');

    this.state.doublesCount = 0;
    this.state.extraRoll = false;
    this.state.pending = null;

    const alive = this.alive();
    if (alive.length === 1) {
      this.state.phase = 'over';
      this.state.winner = alive[0].id;
      this.log(`${alive[0].name} 成为最后的赢家！`, 'win');
      this.emit();
      return;
    }

    let next = this.state.current;
    for (let i = 0; i < this.state.players.length; i++) {
      next = (next + 1) % this.state.players.length;
      if (!this.state.players[next].bankrupt) break;
    }
    this.state.current = next;
    this.state.turn += 1;
    this.state.phase = 'await-roll';
    this.log(`—— 第 ${this.state.turn} 回合，轮到 ${this.cur().name} ——`, 'turn');

    if (this.turnLimitReached()) {
      this.emit();
      return;
    }
    this.emit();
  }

  /**
   * 规则收口：当前版本不含地产交易与拍卖，纯自对弈时可能长期无人破产，
   * 因此设回合上限，到顶后按净资产判胜 —— 与官方锦标赛的限时规则一致。
   *
   * 注意：这个上限会让「未结束率」恒为 0，因此它**不是**对局质量的证据。
   * 真实的收敛性要用关闭上限后的自然结束率来衡量（见 scripts/simulate.mjs）。
   */
  turnLimitReached() {
    if (!this.state.maxTurns || this.state.turn <= this.state.maxTurns) return false;
    if (this.state.phase === 'over') return true;

    const alive = this.alive();
    if (!alive.length) {
      // 防御：无人存活也必须明确收口。否则 phase 会停留在 await-action，
      // UI 不弹结算、模拟器的 while(phase!=='over') 也永远不退出。
      this.state.phase = 'over';
      this.state.winner = null;
      this.log('所有玩家均已破产，对局结束', 'win');
      return true;
    }

    alive.sort((a, b) => this.netWorth(b) - this.netWorth(a));
    this.state.phase = 'over';
    this.state.winner = alive[0].id;
    this.log(`达到 ${this.state.maxTurns} 回合上限，按净资产判定：${alive[0].name} 获胜（${this.netWorth(alive[0])}）`, 'win');
    return true;
  }

  /** 破产清算：资产转移给债权人（或银行），然后出局 */
  declareBankrupt(playerId = this.state.current, creditorId = null) {
    const p = this.state.players[playerId];
    if (p.bankrupt) return;
    const creditor = creditorId === null ? null : this.state.players[creditorId];

    for (const [idx, owner] of Object.entries(this.state.owner)) {
      if (owner !== p.id) continue;
      const i = Number(idx);
      if (creditor) {
        this.state.owner[i] = creditor.id;
        this.state.houses[i] = 0;
      } else {
        delete this.state.owner[i];
        delete this.state.houses[i];
        delete this.state.mortgaged[i];
      }
    }
    if (creditor) creditor.cash += Math.max(0, p.cash);
    p.cash = 0;
    p.bankrupt = true;
    p.inJail = false;
    this.log(`${p.name} 破产出局${creditor ? `，全部资产归 ${creditor.name}` : ''}`, 'bankrupt');

    const alive = this.alive();
    if (alive.length === 1) {
      this.state.phase = 'over';
      this.state.winner = alive[0].id;
      this.log(`${alive[0].name} 成为最后的赢家！`, 'win');
      this.emit();
      return;
    }
    if (p.id === this.state.current) {
      let next = this.state.current;
      for (let i = 0; i < this.state.players.length; i++) {
        next = (next + 1) % this.state.players.length;
        if (!this.state.players[next].bankrupt) break;
      }
      this.state.current = next;
      this.state.turn += 1;
      this.state.doublesCount = 0;
      this.state.extraRoll = false;
      this.state.phase = 'await-roll';
      this.turnLimitReached();
    }
    this.emit();
  }

  /** 给 AI 用：尽可能变现，仍不足则返回 false */
  raiseFunds(playerId, target) {
    const p = this.state.players[playerId];
    let guard = 0;
    while (p.cash < target && guard < 60) {
      guard += 1;
      const { houses, mortgages } = this.assetsOf(playerId);
      // 先卖房（从最贵的开始），再抵押
      if (houses.length) {
        houses.sort((a, b) => BOARD[b].house - BOARD[a].house);
        const idx = houses[0];
        const sq = BOARD[idx];
        p.cash += Math.floor(sq.house / 2);
        this.state.houses[idx] = this.housesOn(idx) - 1;
        continue;
      }
      if (mortgages.length) {
        mortgages.sort((a, b) => BOARD[b].price - BOARD[a].price);
        const idx = mortgages[0];
        p.cash += Math.floor(BOARD[idx].price / 2);
        this.state.mortgaged[idx] = true;
        continue;
      }
      break;
    }
    return p.cash >= target;
  }

  // ---------------------------------------------------------------- 存档
  /**
   * 完整对局快照。因为 RNG 游标、牌堆、牌序、回合上限都已在 this.state 内，
   * 这里一次 JSON 往返即可得到可持久化的纯数据（localStorage / 文件均可）。
   */
  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * 从 snapshot() 的产物恢复对局。
   * 恢复后与中断前**逐字节一致**：后续骰子序列、抽牌序列都不会分叉
   * —— 这一点由 AC-S1 回归测试守着（tests/game.test.js）。
   */
  restore(state) {
    this.state = state;
    this.rng = new Rng(state.rng); // 复用存档里的 RNG 游标
    return this;
  }
}
