/**
 * 机会 / 命运卡
 *
 * 卡牌只描述「发生什么」，具体结算全部在 game.js 里 —— 数据与规则分离，
 * 所以新增一张卡不需要碰引擎逻辑。
 */
export const CHANCE = [
  { id: 'adv-go',       text: '前进到「起点」，领取 200',                            kind: 'moveTo',  to: 0, salary: true },
  { id: 'adv-illinois', text: '前进到「伊利诺伊大道」',                              kind: 'moveTo',  to: 24 },
  { id: 'adv-stcharles',text: '前进到「圣查尔斯广场」',                              kind: 'moveTo',  to: 11 },
  { id: 'adv-util',     text: '前进到最近的公用事业，若无人拥有可购买，否则按骰点 10 倍付租', kind: 'nearest', target: 'util' },
  { id: 'adv-rail',     text: '前进到最近的铁路，并支付双倍租金',                     kind: 'nearest', target: 'rail', doubleRent: true },
  { id: 'bank-div',     text: '银行分红，收取 50',                                   kind: 'collect', amount: 50 },
  { id: 'jail-free',    text: '出狱许可证，可保留待用',                              kind: 'jailCard' },
  { id: 'back-3',       text: '后退三格',                                            kind: 'back',    steps: 3 },
  { id: 'goto-jail',    text: '立即入狱，不经过起点',                                kind: 'jail' },
  { id: 'repairs',      text: '房屋大修：每栋房屋 25，每座酒店 100',                 kind: 'repairs', perHouse: 25, perHotel: 100 },
  { id: 'poor-tax',     text: '缴纳济贫税 15',                                       kind: 'pay',     amount: 15 },
  { id: 'adv-reading',  text: '前往「东方铁路」',                                    kind: 'moveTo',  to: 5 },
  { id: 'chairman',     text: '你当选董事长，向每位玩家支付 50',                      kind: 'payEach', amount: 50 },
  { id: 'loan',         text: '建筑贷款到期，收取 150',                              kind: 'collect', amount: 150 },
];

export const CHEST = [
  { id: 'c-adv-go',     text: '前进到「起点」，领取 200',                            kind: 'moveTo',  to: 0, salary: true },
  { id: 'c-bank-err',   text: '银行结算错误，收取 200',                              kind: 'collect', amount: 200 },
  { id: 'c-doctor',     text: '支付医生诊费 50',                                     kind: 'pay',     amount: 50 },
  { id: 'c-stock',      text: '卖出股票获利 50',                                     kind: 'collect', amount: 50 },
  { id: 'c-jail-free',  text: '出狱许可证，可保留待用',                              kind: 'jailCard' },
  { id: 'c-goto-jail',  text: '立即入狱，不经过起点',                                kind: 'jail' },
  { id: 'c-holiday',    text: '假期基金到期，收取 100',                              kind: 'collect', amount: 100 },
  { id: 'c-refund',     text: '退税，收取 20',                                       kind: 'collect', amount: 20 },
  { id: 'c-birthday',   text: '今天是你的生日，向每位玩家收取 10',                    kind: 'collectEach', amount: 10 },
  { id: 'c-insurance',  text: '人寿保险到期，收取 100',                              kind: 'collect', amount: 100 },
  { id: 'c-hospital',   text: '支付住院费 100',                                      kind: 'pay', amount: 100 },
  { id: 'c-school',     text: '支付学费 50',                                         kind: 'pay', amount: 50 },
  { id: 'c-consult',    text: '咨询费收入 25',                                       kind: 'collect', amount: 25 },
  { id: 'c-repairs',    text: '街道维修：每栋房屋 40，每座酒店 115',                 kind: 'repairs', perHouse: 40, perHotel: 115 },
  { id: 'c-beauty',     text: '选美比赛获得二等奖，收取 10',                          kind: 'collect', amount: 10 },
  { id: 'c-inherit',    text: '继承遗产 100',                                        kind: 'collect', amount: 100 },
];
