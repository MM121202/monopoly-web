import { Game } from '../engine/game.js';
import { BOARD, JAIL_FINE, GROUPS, MAX_HOUSES } from '../engine/data.js';
import { decide } from '../ai/bot.js';

const $ = (sel) => document.querySelector(sel);

const GROUP_COLOR = {
  brown: '#8a5a35',
  lightblue: '#8fcede',
  pink: '#d4649b',
  orange: '#e69a4a',
  red: '#cf4b42',
  yellow: '#e0c54f',
  green: '#479e6a',
  darkblue: '#4566ad',
  rail: '#3c3c42',
  util: '#7b8a6a',
};

const PHASE_TEXT = {
  'await-roll': '等待掷骰',
  'await-buy': '决定是否购买',
  'await-action': '可操作资产',
  over: '对局结束',
};

let game = null;
let busy = false;
let botTimer = null;
let noopStreak = 0;
let lastDice = '0-0';

// 机器人行动间隔；?speed=20 可加速（演示与自动化截图用）
const BOT_DELAY = Math.max(1, Number(new URLSearchParams(location.search).get('speed') ?? 640));

const els = {
  board: $('#board'),
  players: $('#players'),
  turnPlayer: $('#turn-player'),
  turnPhase: $('#turn-phase'),
  dice: [...document.querySelectorAll('.die')],
  controls: $('#controls'),
  assets: $('#assets'),
  log: $('#log'),
  tooltip: $('#tooltip'),
  setup: $('#setup'),
  result: $('#result'),
};

/* ------------------------------------------------------------------ 棋盘 */
function gridPlacement(i) {
  if (i === 0) return [11, 11];
  if (i < 10) return [11, 11 - i];
  if (i === 10) return [11, 1];
  if (i < 20) return [21 - i, 1];
  if (i === 20) return [1, 1];
  if (i < 30) return [1, i - 19];
  if (i === 30) return [1, 11];
  return [i - 29, 11];
}

function sideOf(i) {
  if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
  if (i < 10) return 'bottom';
  if (i < 20) return 'left';
  if (i < 30) return 'top';
  return 'right';
}

const CORNER_TEXT = {
  0: { title: '起点', sub: 'GO · +200' },
  10: { title: '监狱', sub: 'JAIL' },
  20: { title: '免费停车', sub: 'FREE' },
  30: { title: '入狱', sub: 'GO TO JAIL' },
};

function buildBoard() {
  els.board.innerHTML = '';

  const center = document.createElement('div');
  center.className = 'board__center';
  center.innerHTML = `
    <div class="center__inner">
      <div class="center__title">大富翁</div>
      <div class="center__sub">Monopoly Web</div>
      <div class="center__odds">40 格 · 2–4 人 · 可复现随机</div>
    </div>`;
  els.board.appendChild(center);

  for (const sq of BOARD) {
    const [row, col] = gridPlacement(sq.i);
    const side = sideOf(sq.i);
    const cell = document.createElement('div');
    cell.className = side === 'corner' ? 'cell cell--corner' : 'cell';
    cell.dataset.side = side;
    cell.dataset.index = String(sq.i);
    cell.style.gridRow = String(row);
    cell.style.gridColumn = String(col);
    cell.setAttribute('role', 'gridcell');

    if (side === 'corner') {
      const t = CORNER_TEXT[sq.i];
      cell.innerHTML = `<div><div>${t.title}</div><div style="font-size:.72em;opacity:.62;letter-spacing:.1em">${t.sub}</div></div>`;
    } else {
      const color = sq.group ? GROUP_COLOR[sq.group] : GROUP_COLOR[sq.type] ?? null;
      const bar = color ? `<div class="cell__bar" style="--group:${color};background:${color}"></div>` : '';
      const price = sq.price ? `<span class="cell__price">${sq.price}</span>` : '';
      cell.innerHTML = `${bar}<div class="cell__label"><span>${sq.name}</span>${price}</div><div class="cell__houses"></div><div class="tokens"></div>`;
    }

    cell.addEventListener('mouseenter', (e) => showTooltip(sq.i, e));
    cell.addEventListener('mousemove', moveTooltip);
    cell.addEventListener('mouseleave', hideTooltip);
    els.board.appendChild(cell);
  }
}

function cellEl(i) {
  return els.board.querySelector(`.cell[data-index="${i}"]`);
}

/* ------------------------------------------------------------------ 提示 */
function showTooltip(i, ev) {
  const sq = BOARD[i];
  const tip = els.tooltip;
  if (!sq.price) {
    tip.innerHTML = `<div class="tooltip__title">${sq.name}</div><div class="tooltip__row">${sq.sub ?? ''}</div>`;
    tip.hidden = false;
    moveTooltip(ev);
    return;
  }

  const ownerId = game?.state.owner[i];
  const owner = ownerId === undefined ? null : game.state.players[ownerId];
  const rows = [];

  if (sq.type === 'prop') {
    const names = ['基础租金', '1 栋', '2 栋', '3 栋', '4 栋', '酒店'];
    sq.rent.forEach((v, k) => rows.push({ k: names[k], v }));
  } else if (sq.type === 'rail') {
    rows.push({ k: '1 条', v: 25 }, { k: '2 条', v: 50 }, { k: '3 条', v: 100 }, { k: '4 条', v: 200 });
  } else {
    rows.push({ k: '持有 1 家', v: '骰点 ×4' }, { k: '持有 2 家', v: '骰点 ×10' });
  }

  tip.innerHTML = `
    <div class="tooltip__title">${sq.name}</div>
    <div class="tooltip__row"><span>价格</span><span>${sq.price}</span></div>
    <div class="tooltip__row"><span>抵押价值</span><span>${Math.floor(sq.price / 2)}</span></div>
    ${sq.house ? `<div class="tooltip__row"><span>建造单价</span><span>${sq.house}</span></div>` : ''}
    <div style="height:6px"></div>
    ${rows.map((r) => `<div class="tooltip__row${r.k === '酒店' ? ' tooltip__row--hi' : ''}"><span>${r.k}</span><span>${r.v}</span></div>`).join('')}
    ${owner ? `<div style="height:6px"></div><div class="tooltip__row"><span>拥有者</span><span style="color:${owner.color}">${owner.name}</span></div>` : ''}
  `;
  tip.hidden = false;
  moveTooltip(ev);
}

function moveTooltip(ev) {
  const tip = els.tooltip;
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = ev.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = ev.clientY - rect.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

/* ------------------------------------------------------------------ 渲染 */
function render() {
  if (!game) return;
  const s = game.state;
  const cur = game.cur();

  // 回合信息
  els.turnPlayer.textContent = s.phase === 'over'
    ? '对局结束'
    : `${cur.name}${cur.isBot && !cur.name.includes('电脑') ? '（电脑）' : ''}`;
  const limitText = game.maxTurns ? ` / ${game.maxTurns}` : '';
  els.turnPhase.textContent = `第 ${s.turn}${limitText} 回合 · ${PHASE_TEXT[s.phase] ?? s.phase}`;

  renderDice(s.dice);
  renderCells(s);
  renderPlayers(s);
  renderControls(s, cur);
  renderAssets(s);
  renderLog(s);

  if (s.phase === 'over') showResult(s);
  scheduleBot();
}

function renderDice(dice) {
  const key = dice.join('-');
  if (key !== lastDice) lastDice = key;
  els.dice.forEach((d, i) => {
    const v = dice[i] ?? 0;
    d.dataset.face = String(v);
  });
}

function renderCells(s) {
  for (const sq of BOARD) {
    const cell = cellEl(sq.i);
    if (!cell) continue;
    const ownerId = s.owner[sq.i];

    if (ownerId !== undefined) {
      cell.dataset.owner = '1';
      cell.style.setProperty('--owner', s.players[ownerId].color);
    } else {
      delete cell.dataset.owner;
    }

    if (s.mortgaged[sq.i]) cell.dataset.mortgaged = '1';
    else delete cell.dataset.mortgaged;

    const houseBox = cell.querySelector('.cell__houses');
    if (houseBox) {
      const n = s.houses[sq.i] ?? 0;
      houseBox.innerHTML = n === MAX_HOUSES
        ? '<span class="house house--hotel"></span>'
        : '<span class="house"></span>'.repeat(n);
    }

    const tokenBox = cell.querySelector('.tokens');
    if (tokenBox) {
      tokenBox.innerHTML = '';
      for (const p of s.players) {
        if (p.bankrupt || p.pos !== sq.i) continue;
        const t = document.createElement('span');
        t.className = 'token' + (p.id === s.current && s.phase !== 'over' ? ' token--active' : '');
        t.style.setProperty('--c', p.color);
        t.title = p.name;
        tokenBox.appendChild(t);
      }
    }
  }
}

function renderPlayers(s) {
  els.players.innerHTML = '';
  for (const p of s.players) {
    const active = p.id === s.current && s.phase !== 'over';
    const el = document.createElement('div');
    el.className = 'player' + (active ? ' player--active' : '') + (p.bankrupt ? ' player--out' : '');
    el.innerHTML = `
      <span class="player__dot" style="--c:${p.color}"></span>
      <div>
        <div class="player__name">${escapeHtml(p.name)}${p.isBot ? '<span class="player__tag">AI</span>' : ''}</div>
        <div class="player__meta">地产 ${Object.values(s.owner).filter((o) => o === p.id).length} · 净资产 ${game.netWorth(p)}${p.inJail ? ' · 狱中' : ''}${p.jailCards ? ` · 出狱卡×${p.jailCards}` : ''}</div>
      </div>
      <div class="player__cash${p.cash < 0 ? ' player__cash--neg' : ''}">${p.cash}</div>
    `;
    els.players.appendChild(el);
  }
}

function renderControls(s, cur) {
  const box = els.controls;
  box.innerHTML = '';
  if (s.phase === 'over') {
    box.append(button('再来一局', 'btn--primary', () => openSetup()));
    return;
  }
  const isHuman = !cur.isBot;

  if (s.phase === 'await-roll') {
    if (cur.inJail) {
      box.append(button(`缴纳保释金 ${JAIL_FINE}`, '', () => act(() => game.payJailFine()), !isHuman || cur.cash < JAIL_FINE));
      if (cur.jailCards > 0) box.append(button('使用出狱卡', '', () => act(() => game.useJailCard()), !isHuman));
    }
    box.append(button('掷骰子', 'btn--primary', () => performRoll(() => game.roll()), !isHuman || busy));
  }

  if (s.phase === 'await-buy') {
    const sq = BOARD[s.pending.idx];
    box.append(button(`购买 ${sq.name}（${sq.price}）`, 'btn--gold', () => act(() => game.buy()), !isHuman));
    box.append(button('放弃', '', () => act(() => game.skipBuy()), !isHuman));
  }

  if (s.phase === 'await-action') {
    box.append(button('结束回合', 'btn--primary', () => act(() => game.endTurn()), !isHuman || cur.cash < 0));
    if (cur.cash < 0) {
      box.append(button('宣布破产', 'btn--danger', () => act(() => game.declareBankrupt(cur.id, null)), !isHuman));
    }
  }

  if (!isHuman) {
    const hint = document.createElement('span');
    hint.className = 'player__meta';
    hint.textContent = '电脑行动中…';
    box.appendChild(hint);
  }
}

function renderAssets(s) {
  const human = s.players.find((p) => !p.isBot && !p.bankrupt) ?? s.players[0];
  const mine = Object.entries(s.owner)
    .filter(([, id]) => id === human.id)
    .map(([idx]) => Number(idx))
    .sort((a, b) => a - b);

  if (!mine.length) {
    els.assets.innerHTML = '<p class="empty">还没有地产</p>';
    return;
  }

  const canAct = s.current === human.id && !human.isBot && s.phase !== 'over';
  els.assets.innerHTML = '';

  for (const idx of mine) {
    const sq = BOARD[idx];
    const h = game.housesOn(idx);
    const color = sq.group ? GROUP_COLOR[sq.group] : GROUP_COLOR[sq.type];
    const row = document.createElement('div');
    row.className = 'asset';
    const label = sq.type === 'prop'
      ? (h === MAX_HOUSES ? '酒店' : h > 0 ? `${h} 栋` : game.groupFull(sq.group, human.id) ? '整组' : '单块')
      : sq.type === 'rail' ? '铁路' : '公用事业';
    row.innerHTML = `
      <span class="asset__chip" style="--group:${color};background:${color}"></span>
      <div class="asset__body">
        <div class="asset__name">${sq.name}${s.mortgaged[idx] ? ' · 已抵押' : ''}</div>
        <div class="asset__meta">${label}</div>
      </div>
      <div class="asset__ops"></div>`;

    const ops = row.querySelector('.asset__ops');
    if (canAct) {
      if (game.canBuild(idx) && s.current === human.id) {
        ops.append(button(h === MAX_HOUSES - 1 ? `建酒店 ${sq.house}` : `建房 ${sq.house}`, 'btn--sm', () => act(() => game.build(idx))));
      }
      if (s.current === human.id && game.canSellHouse(idx)) {
        ops.append(button('卖房', 'btn--sm', () => act(() => game.sellHouse(idx))));
      }
      if (s.current === human.id && game.canMortgage(idx)) {
        ops.append(button('抵押', 'btn--sm', () => act(() => game.mortgage(idx))));
      }
      if (s.current === human.id && game.canUnmortgage(idx)) {
        ops.append(button('赎回', 'btn--sm', () => act(() => game.unmortgage(idx))));
      }
    }
    els.assets.appendChild(row);
  }
}

function renderLog(s) {
  els.log.innerHTML = s.log
    .slice(-40)
    .map((e) => `<li data-kind="${e.kind}">${escapeHtml(e.text)}</li>`)
    .join('');
}

function showResult(s) {
  if (!els.result.hidden) return;
  const winner = s.players[s.winner];
  $('#result-title').textContent = '对局结束';
  $('#result-text').textContent = winner
    ? `${winner.name} 成为最后的赢家，净资产 ${game.netWorth(winner)}。`
    : '所有玩家均已破产。';
  els.result.hidden = false;
}

/* ------------------------------------------------------------------ 交互 */
function button(label, variant, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${variant}`.trim();
  b.textContent = label;
  b.disabled = !!disabled;
  b.addEventListener('click', onClick);
  return b;
}

function act(fn) {
  if (busy) return;
  try {
    fn();
  } catch (err) {
    console.warn(err);
  }
  render();
}

function performRoll(fn) {
  if (busy) return;
  busy = true;
  els.dice.forEach((d) => d.classList.add('die--rolling'));
  setTimeout(() => {
    try {
      fn();
    } catch (err) {
      console.warn(err);
    }
    els.dice.forEach((d) => d.classList.remove('die--rolling'));
    busy = false;
    render();
  }, 360);
}

function scheduleBot() {
  clearTimeout(botTimer);
  if (!game) return;
  const cur = game.cur();
  if (!cur || !cur.isBot || game.state.phase === 'over') return;

  botTimer = setTimeout(() => {
    const action = decide(game);
    if (!action) return;
    if (action.action === 'noop') {
      noopStreak += 1;
      if (noopStreak > 6) {
        noopStreak = 0;
        act(() => game.endTurn());
        return;
      }
      render();
      return;
    }
    noopStreak = 0;
    if (action.action === 'roll') {
      performRoll(() => game.roll());
      return;
    }
    act(() => {
      switch (action.action) {
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
        default: return undefined;
      }
    });
  }, BOT_DELAY);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ------------------------------------------------------------------ 开局 */
function openSetup() {
  els.result.hidden = true;
  els.setup.hidden = false;
  els.setup.setAttribute('aria-hidden', 'false');
  $('#in-name').focus();
}

function startGame() {
  const name = ($('#in-name').value || '玩家').trim().slice(0, 12);
  const count = Number($('#in-count').value);
  const seedRaw = $('#in-seed').value.trim();
  // 纯数字直接当种子用（方便按编号复现），其余字符串走哈希
  const seed = !seedRaw ? (Date.now() >>> 0)
    : /^\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0
      : hashSeed(seedRaw);
  const maxTurns = Number($('#in-turns')?.value ?? 150);

  const allBots = new URLSearchParams(location.search).get('bot') === '1';
  const botNames = ['电脑·A', '电脑·B', '电脑·C', '电脑·D'];
  const players = [];
  if (allBots) {
    for (let i = 0; i < count; i++) players.push({ name: botNames[i], isBot: true });
  } else {
    players.push({ name, isBot: false });
    for (let i = 1; i < count; i++) players.push({ name: botNames[i - 1], isBot: true });
  }

  els.setup.hidden = true;
  els.result.hidden = true;
  lastDice = '0-0';
  noopStreak = 0;

  game = new Game({ players, seed, maxTurns });
  game.subscribe(() => render());

  buildBoard();
  render();
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ 启动 */
$('#btn-start').addEventListener('click', startGame);
$('#btn-new').addEventListener('click', openSetup);
$('#btn-again').addEventListener('click', openSetup);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
});

buildBoard();

// ?demo=1&seed=xxx 直接开局 —— 给截图与演示用，不影响正常玩法
const params = new URLSearchParams(location.search);
if (params.get('demo')) {
  $('#in-name').value = params.get('name') ?? '玩家';
  $('#in-count').value = params.get('players') ?? '4';
  $('#in-seed').value = params.get('seed') ?? 'demo';
  startGame();
} else {
  renderControls({ phase: 'over', players: [], current: 0, log: [] }, { isBot: true, inJail: false, jailCards: 0, cash: 0 });
  openSetup();
}
void GROUPS;
