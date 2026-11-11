export const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', color: '#e7a96c' }, { name: '购物', icon: '🛍️', color: '#d7919d' },
  { name: '交通', icon: '🚇', color: '#8ab5c9' }, { name: '居家', icon: '🏠', color: '#a9b899' },
  { name: '娱乐', icon: '🎬', color: '#a697c6' }, { name: '医疗', icon: '💊', color: '#9ac7bd' },
  { name: '学习', icon: '📚', color: '#bda887' }, { name: '其他', icon: '•••', color: '#a8b5a9' }
];
export const INCOME_CATEGORIES = [
  { name: '工资', icon: '💼', color: '#70ae88' }, { name: '奖金', icon: '🎁', color: '#e5b271' },
  { name: '兼职', icon: '✨', color: '#9aafcb' }, { name: '退款', icon: '↩️', color: '#aa9bc0' },
  { name: '其他', icon: '•••', color: '#a8b5a9' }
];

function decodeShortcutText(value) {
  let text = String(value || '');
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(text); i++) {
    let decoded;
    try { decoded = decodeURIComponent(text.replace(/%(?![0-9a-f]{2})/gi, '%25')); }
    catch { decoded = text.replace(/%0d%0a|%0a|%0d/gi, '\n').replace(/%20/gi, ' '); }
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}
const normalize = value => decodeShortcutText(value).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/．/g, '.').replace(/，/g, ',').replace(/：/g, ':').replace(/￥/g, '¥');
const dateLabel = /交易时间|支付时间|付款时间|收款时间|成交时间|完成时间|到账时间/;
const fullDatePattern = /(?<!\d)(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?!\d)/g;
const partialDatePattern = /(?<!\d)(\d{1,2})月\s*(\d{1,2})日(?!\d)/;
const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function calendarDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function findDate(lines, today) {
  const fallback = formatDate(today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const candidates = [];
  let invalidLabelledDate = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const match of line.matchAll(fullDatePattern)) {
      const date = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
      const labelled = dateLabel.test(line) || dateLabel.test(lines[i - 1] || '');
      if (!date) { if (labelled) invalidLabelledDate = true; continue; }
      candidates.push({ date: formatDate(date), score: labelled ? 5 : /订单时间|创建时间/.test(line) ? 2 : 3, future: date.getTime() > todayStart });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const ambiguous = candidates.some(other => other.score === best.score && other.date !== best.date);
    return { date: best.date, reason: best.future ? '识别的交易日期在未来，请核对' : ambiguous ? '识别到多个日期，请核对交易日期' : invalidLabelledDate ? '识别到无效日期，请核对交易日期' : '' };
  }
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(partialDatePattern);
    if (!match) continue;
    const date = calendarDate(today.getFullYear(), Number(match[1]), Number(match[2]));
    if (!date) return { date: fallback, reason: '识别的交易日期无效，请核对' };
    return { date: formatDate(date), reason: '日期缺少年份，请核对' };
  }
  return { date: fallback, reason: invalidLabelledDate ? '识别的交易日期无效，请核对' : '' };
}

function amountFromLine(line) {
  const cleaned = line.replace(/,/g, '');
  const match = cleaned.match(/(?:¥\s*[-−]?\s*|(?:实付款|实付金额|付款金额|支付金额|收款金额|到账金额|交易金额|实收金额|订单金额|金额|合计)\s*[:：]?\s*[-−]?\s*¥?\s*)(\d{1,8}(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const cents = Math.round(Number(match[1]) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 10000000000 ? cents : null;
}

function findAmount(lines) {
  const candidates = [];
  const strongAmountLabel = /实付款|实付金额|付款金额|支付金额|收款金额|到账金额|交易金额|实收金额/;
  const amountLabel = /订单金额|金额|合计/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/余额|优惠|红包|积分|手续费|原价|剩余|抵扣|折扣|省了|付款方式|银行卡|尾号/.test(line)) continue;
    const previous = lines[i - 1] || '';
    let cents = amountFromLine(line);
    if (cents === null && (strongAmountLabel.test(previous) || amountLabel.test(previous)) && /^\s*[-−]?\s*¥?\s*\d{1,8}(?:\.\d{1,2})?\s*$/.test(line)) {
      cents = Math.round(Number(line.replace(/[^\d.]/g, '')) * 100);
    }
    const standalone = /^\s*[-−]\s*\d{1,8}\.\d{1,2}\s*$/.test(line);
    if (cents === null && standalone && i < 15 && /支付成功|付款成功|交易成功|交易已完成/.test(lines.slice(i + 1, i + 4).join(' '))) {
      cents = Math.round(Number(line.replace(/[^\d.]/g, '')) * 100);
    }
    if (cents === null || !Number.isSafeInteger(cents) || cents <= 0 || cents > 10000000000) continue;
    let score = strongAmountLabel.test(line) || strongAmountLabel.test(previous) ? 5 : standalone ? 4 : amountLabel.test(line) || amountLabel.test(previous) ? 3 : /支付成功|付款成功|收款成功|交易成功|交易已完成/.test(line) || /支付成功|付款成功|收款成功|交易成功|交易已完成/.test(previous) ? 4 : 2;
    if (i > 10) score -= 1;
    candidates.push({ cents, score, index: i });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  if (candidates.length) return candidates[0];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/余额|优惠|红包|积分|手续费|原价|剩余|抵扣|折扣|省了|银行卡|尾号|时间|日期|订单号/.test(line) || /20\d{2}\s*[-/.年]\s*\d{1,2}/.test(line)) continue;
    const match = line.replace(/,/g, '').match(/(?<!\d)(\d{1,8}\.\d{1,2})(?!\d)/);
    if (!match) continue;
    const cents = Math.round(Number(match[1]) * 100);
    if (Number.isSafeInteger(cents) && cents > 0 && cents <= 10000000000) return { cents, score: 1, index: i };
  }
  return null;
}

const merchantLabel = /^(?:商户(?:全称|名称)?|收款方(?:全称|名称)?(?!式)|付款方(?!式)|收款人|交易对方|对方(?:名称)?|店铺(?:名称)?|商家(?:名称)?)\s*[:：]?\s*(.*)$/;
const productLabel = /^(?:商品\/服务|商品(?:说明|名称|详情|信息)?|订单商品|交易商品|交易内容|付款说明|购买商品)\s*[:：]?\s*(.*)$/;
const detailNoise = /^(?:微信支付|支付宝|支付成功|付款成功|收款成功|交易成功|账单详情|订单详情|交易详情|支付详情|订单号|交易单号|商户单号|流水号|付款方式|支付方式|银行卡|复制|完成|查看详情|感谢使用|¥)/;

function cleanDetail(value) {
  const cleaned = String(value || '').replace(/^[\s:：·•—-]+/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned.length >= 2 && !detailNoise.test(cleaned) && !/^[+\-\d.,\s]+$/.test(cleaned) && !merchantLabel.test(cleaned) && !productLabel.test(cleaned) && !dateLabel.test(cleaned) ? cleaned : '';
}

function findLabeledDetail(lines, label) {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(label);
    if (!match) continue;
    const inline = cleanDetail(match[1]);
    if (inline) return inline;
    const next = cleanDetail(lines[i + 1]);
    if (next) {
      const continuation = lines[i + 2] || '';
      if (label === productLabel && /[A-Za-z]$/.test(next) && /^[A-Za-z]{2,16}$/.test(continuation)) return (next + continuation).slice(0, 60);
      return next;
    }
  }
  return '';
}

function findMerchant(lines) {
  const labeled = findLabeledDetail(lines, merchantLabel);
  if (labeled) return { name: labeled, needsReview: false };
  const candidates = lines.filter((line, index) => cleanDetail(line) && !(index > 0 && productLabel.test(lines[index - 1])) && !/金额|合计|时间|日期|订单|账单|备注|分类|收款机构|清算机构|支付奖励|推荐服务/.test(line));
  return candidates.length === 1 ? { name: cleanDetail(candidates[0]), needsReview: true } : { name: '', needsReview: false };
}

function classifyBuiltIn(text, type) {
  if (type === 'income') {
    if (/退款|退货|退回/.test(text)) return '退款';
    if (/工资|薪资|薪酬/.test(text)) return '工资';
    if (/奖金|红包|补贴/.test(text)) return '奖金';
    if (/兼职|稿费|劳务/.test(text)) return '兼职';
    return '其他';
  }
  if (/便利店|便利超市|7[- ]?ELEVEN|全家便利|罗森便利|餐|饭|外卖|咖啡|奶茶|火锅|面馆|肯德基|麦当劳|美团|饿了么|水果|古茗|蜜雪冰城|霸王茶姬|喜茶|奈雪|茶百道|瑞幸|星巴克|库迪|Manner/i.test(text)) return '餐饮';
  if (/超市|日用百货/i.test(text)) return '购物';
  if (/地铁|公交|打车|滴滴|高铁|机票|停车|加油|出行/.test(text)) return '交通';
  if (/淘宝|京东|拼多多|购物|商城|服饰|优衣库/.test(text)) return '购物';
  if (/房租|物业|水费|电费|燃气|宽带|家居/.test(text)) return '居家';
  if (/电影|游戏|演出|会员|音乐/.test(text)) return '娱乐';
  if (/医院|药店|诊所|医疗|挂号/.test(text)) return '医疗';
  if (/课程|书店|培训|学费|教育/.test(text)) return '学习';
  return '其他';
}

function guessCategory(text, type, customCategories = [], product = '', merchant = '') {
  const custom = customCategories.filter(c => c.type === type && c.name !== '其他' && c.name.length >= 2).sort((a, b) => b.name.length - a.name.length);
  for (const source of [product, merchant, text]) {
    if (!source) continue;
    const matchedCustom = custom.find(c => source.includes(c.name));
    if (matchedCustom) return matchedCustom.name;
    const builtIn = classifyBuiltIn(source, type);
    if (builtIn !== '其他') return builtIn;
  }
  return '其他';
}

export function parseOCR(rawText, today = new Date(), customCategories = []) {
  const text = normalize(rawText).trim();
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!text) return { status: 'review', reason: '没有识别到文字', type: 'expense', amountCents: null, category: '其他', merchant: '', note: '' };
  const failed = /支付失败|付款失败|收款失败|交易失败|支付中|待支付|待付款|未支付|已取消|交易关闭|退款中/.test(text);
  const income = /收款成功|已收款|到账成功|入账成功|收入成功|退款成功|退款到账/.test(text);
  const expense = /支付成功|付款成功|已支付|支付完成|付款完成|扣款成功|支出成功|交易成功|交易已完成|订单已完成/.test(text);
  const type = income && !expense ? 'income' : 'expense';
  const amount = findAmount(lines);
  const product = findLabeledDetail(lines, productLabel);
  const merchantResult = findMerchant(lines);
  const merchant = merchantResult.name;
  const note = product ? '商品：' + product : '';
  const category = guessCategory(text, type, customCategories, product, merchant);
  const foundDate = findDate(lines, today);
  const date = foundDate.date;
  let reason = '';
  if (failed) reason = '画面显示交易未完成，请核对';
  else if (!income && !expense) reason = '没有找到交易成功或收付款完成提示，请核对';
  else if (income && expense) reason = '收支方向不明确，请核对';
  else if (!amount) reason = '没有找到明确的交易金额，请核对';
  else if (amount.score < 3) reason = '金额缺少交易标签，请核对';
  else if (foundDate.reason) reason = foundDate.reason;
  else if (merchantResult.needsReview) reason = '商户名称由画面推测，请核对';
  return { status: reason ? 'review' : 'auto', reason, type, amountCents: amount?.cents || null, category, merchant, product, note, date };
}
