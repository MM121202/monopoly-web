/**
 * 棋盘数据 —— 标准 40 格布局（中文命名）
 *
 * type:  go | prop | rail | util | chance | chest | tax | jail | gotojail | parking
 * rent:  [基础, 1栋, 2栋, 3栋, 4栋, 酒店]
 * house: 每栋房屋的造价（同时也是卖出价的一半基准）
 */
export const BOARD = [
  { i: 0,  type: 'go',   name: '起点',           sub: '经过或停留 +200' },
  { i: 1,  type: 'prop', name: '地中海大道',     group: 'brown',     price: 60,  rent: [2, 10, 30, 90, 160, 250],       house: 50 },
  { i: 2,  type: 'chest', name: '命运',          sub: '抽一张命运卡' },
  { i: 3,  type: 'prop', name: '波罗的海大道',   group: 'brown',     price: 60,  rent: [4, 20, 60, 180, 320, 450],      house: 50 },
  { i: 4,  type: 'tax',  name: '所得税',         sub: '缴纳 200' },
  { i: 5,  type: 'rail', name: '东方铁路',       price: 200, rent: [25, 50, 100, 200] },
  { i: 6,  type: 'prop', name: '东方大道',       group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550],      house: 50 },
  { i: 7,  type: 'chance', name: '机会',         sub: '抽一张机会卡' },
  { i: 8,  type: 'prop', name: '佛蒙特大道',     group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550],      house: 50 },
  { i: 9,  type: 'prop', name: '康涅狄格大道',   group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600],     house: 50 },
  { i: 10, type: 'jail', name: '监狱',           sub: '仅探监' },
  { i: 11, type: 'prop', name: '圣查尔斯广场',   group: 'pink',      price: 140, rent: [10, 50, 150, 450, 625, 750],     house: 100 },
  { i: 12, type: 'util', name: '电力公司',       price: 150 },
  { i: 13, type: 'prop', name: '州立大道',       group: 'pink',      price: 140, rent: [10, 50, 150, 450, 625, 750],     house: 100 },
  { i: 14, type: 'prop', name: '弗吉尼亚大道',   group: 'pink',      price: 160, rent: [12, 60, 180, 500, 700, 900],     house: 100 },
  { i: 15, type: 'rail', name: '宾夕法尼亚铁路', price: 200, rent: [25, 50, 100, 200] },
  { i: 16, type: 'prop', name: '圣詹姆斯广场',   group: 'orange',    price: 180, rent: [14, 70, 200, 550, 750, 950],     house: 100 },
  { i: 17, type: 'chest', name: '命运',          sub: '抽一张命运卡' },
  { i: 18, type: 'prop', name: '田纳西大道',     group: 'orange',    price: 180, rent: [14, 70, 200, 550, 750, 950],     house: 100 },
  { i: 19, type: 'prop', name: '纽约大道',       group: 'orange',    price: 200, rent: [16, 80, 220, 600, 800, 1000],    house: 100 },
  { i: 20, type: 'parking', name: '免费停车',    sub: '休息一回合' },
  { i: 21, type: 'prop', name: '肯塔基大道',     group: 'red',       price: 220, rent: [18, 90, 250, 700, 875, 1050],    house: 150 },
  { i: 22, type: 'chance', name: '机会',         sub: '抽一张机会卡' },
  { i: 23, type: 'prop', name: '印第安纳大道',   group: 'red',       price: 220, rent: [18, 90, 250, 700, 875, 1050],    house: 150 },
  { i: 24, type: 'prop', name: '伊利诺伊大道',   group: 'red',       price: 240, rent: [20, 100, 300, 750, 925, 1100],   house: 150 },
  { i: 25, type: 'rail', name: 'B&O 铁路',       price: 200, rent: [25, 50, 100, 200] },
  { i: 26, type: 'prop', name: '大西洋大道',     group: 'yellow',    price: 260, rent: [22, 110, 330, 800, 975, 1150],   house: 150 },
  { i: 27, type: 'prop', name: '文特诺大道',     group: 'yellow',    price: 260, rent: [22, 110, 330, 800, 975, 1150],   house: 150 },
  { i: 28, type: 'util', name: '自来水厂',       price: 150 },
  { i: 29, type: 'prop', name: '马文花园',       group: 'yellow',    price: 280, rent: [24, 120, 360, 850, 1025, 1200],  house: 150 },
  { i: 30, type: 'gotojail', name: '入狱',       sub: '直接进监狱' },
  { i: 31, type: 'prop', name: '太平洋大道',     group: 'green',     price: 300, rent: [26, 130, 390, 900, 1100, 1275],  house: 200 },
  { i: 32, type: 'prop', name: '北卡罗来纳大道', group: 'green',     price: 300, rent: [26, 130, 390, 900, 1100, 1275],  house: 200 },
  { i: 33, type: 'chest', name: '命运',          sub: '抽一张命运卡' },
  { i: 34, type: 'prop', name: '宾夕法尼亚大道', group: 'green',     price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200 },
  { i: 35, type: 'rail', name: '短线铁路',       price: 200, rent: [25, 50, 100, 200] },
  { i: 36, type: 'chance', name: '机会',         sub: '抽一张机会卡' },
  { i: 37, type: 'prop', name: '公园广场',       group: 'darkblue',  price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200 },
  { i: 38, type: 'tax',  name: '奢侈税',         sub: '缴纳 100' },
  { i: 39, type: 'prop', name: '木板路',         group: 'darkblue',  price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200 },
];

export const GROUPS = (() => {
  const m = new Map();
  for (const sq of BOARD) {
    if (sq.group) {
      if (!m.has(sq.group)) m.set(sq.group, []);
      m.get(sq.group).push(sq.i);
    }
  }
  return m;
})();

export const SQUARE = BOARD.length; // 40
export const JAIL_INDEX = 10;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const START_CASH = 1500;
export const MAX_HOUSES = 5; // 5 = 酒店

/** 铁路租金按持有数的档位 */
export function railRent(owned) {
  return [0, 25, 50, 100, 200][owned] ?? 0;
}

/** 公用事业租金倍率：持有 1 家 ×4，2 家 ×10 */
export function utilMultiplier(owned) {
  return owned >= 2 ? 10 : 4;
}
