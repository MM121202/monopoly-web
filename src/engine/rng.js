/**
 * 可复现的伪随机数生成器（mulberry32）
 * 用同一个 seed 跑出的对局完全一致 —— 这是测试能断言的唯一前提。
 *
 * 设计：Rng 不自己持有游标，而是持有一个「游标对象」的引用
 * （形如 `{ seed, state }`）。每次 next() 都把最新游标写回该对象。
 * 把同一个对象挂到 game.state.rng 上，掷骰的推进就自动进了可序列化状态，
 * 存档/读档后能逐字节复现后续随机序列（见 game.js 的 snapshot/restore）。
 */
export class Rng {
  /**
   * @param {number|{seed:number, state?:number}} seedOrCursor
   *   传数字：按该种子初始化（旧用法，保持兼容）
   *   传对象：直接复用其游标（用于从存档恢复）
   */
  constructor(seedOrCursor = 0x9e3779b9) {
    if (typeof seedOrCursor === 'number') {
      const seed = seedOrCursor >>> 0;
      this.cursor = { seed, state: seed || 1 };
    } else {
      this.cursor = seedOrCursor;
      if (this.cursor.state === undefined) {
        this.cursor.state = (this.cursor.seed >>> 0) || 1;
      }
    }
  }

  get seed() {
    return this.cursor.seed;
  }

  set seed(v) {
    this.cursor.seed = v >>> 0;
  }

  get state() {
    return this.cursor.state;
  }

  set state(v) {
    this.cursor.state = v >>> 0;
  }

  /** 当前游标的纯数据副本，便于序列化 */
  toCursor() {
    return { seed: this.cursor.seed, state: this.cursor.state };
  }

  next() {
    // mulberry32 —— 与旧实现逐位一致，保证历史对局序列不变
    this.cursor.state = (this.cursor.state + 0x6d2b79f5) >>> 0;
    let t = this.cursor.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 1..6 */
  die() {
    return 1 + Math.floor(this.next() * 6);
  }

  /** 0..n-1 */
  int(n) {
    return Math.floor(this.next() * n);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
