/**
 * 可复现的伪随机数生成器（mulberry32）
 * 用同一个 seed 跑出的对局完全一致 —— 这是测试能断言的唯一前提。
 */
export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0;
    this.state = this.seed || 1;
  }

  next() {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
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
