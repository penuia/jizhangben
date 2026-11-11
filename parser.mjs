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

const normalize = value => String(value || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/．/g, '.').replace(/，/g, ',').replace(/：/g, ':').replace(/￥/g, '¥');

function amountFromLine(line) {
  const cleaned = line.replace(/,/g, '');
  const match = cleaned.match(/(?:¥\s*|(?:实付款|实付金额|付款金额|支付金额|收款金额|到账金额|交易金额|实收金额|订单金额|金额|合计)\s*[:：]?\s*)(\d{1,8}(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const cents = Math.round(Number(match[1]) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 10000000000 ? cents : null;
}

function findAmount(lines) {
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/余额|优惠|红包|积分|手续费|原价|剩余|抵扣|折扣|省了|付款方式|银行卡|尾号/.test(line)) continue;
    const cents = amountFromLine(line);
    if (cents === null) continue;
    let score = /实付款|实付金额|付款金额|支付金额|收款金额|到账金额|交易金额|实收金额/.test(line) ? 5 : /订单金额|金额|合计/.test(line) ? 3 : /实付款|实付金额|付款金额|支付金额|收款金额|到账金额|交易金额|实收金额/.test(lines[i - 1] || '') ? 5 : /支付成功|付款成功|收款成功/.test(line) ? 4 : /支付成功|付款成功|收款成功/.test(lines[i - 1] || '') ? 4 : 2;
    if (i > 10) score -= 1;
    candidates.push({ cents, score, index: i });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0] || null;
}

function findMerchant(lines) {
  for (const line of lines) {
    const match = line.match(/(?:商户(?:名称)?|收款方|付款方|店铺(?:名称)?|交易对方|对方)\s*[:：]?\s*(.{2,40})/);
    if (match) {
      const merchant = match[1].trim().replace(/^(?:名称|信息)\s*[:：]?\s*/, '');
      if (merchant && !/^(?:微信支付|支付宝|支付成功|付款成功|收款成功)$/.test(merchant)) return merchant.slice(0, 40);
    }
  }
  return '';
}

function guessCategory(text, type) {
  if (type === 'income') {
    if (/退款|退货|退回/.test(text)) return '退款';
    if (/工资|薪资|薪酬/.test(text)) return '工资';
    if (/奖金|红包|补贴/.test(text)) return '奖金';
    if (/兼职|稿费|劳务/.test(text)) return '兼职';
    return '其他';
  }
  if (/餐|饭|外卖|咖啡|奶茶|火锅|面馆|肯德基|麦当劳|美团|饿了么|便利店|超市|水果/.test(text)) return '餐饮';
  if (/地铁|公交|打车|滴滴|高铁|机票|停车|加油|出行/.test(text)) return '交通';
  if (/淘宝|京东|拼多多|购物|商城|服饰|优衣库/.test(text)) return '购物';
  if (/房租|物业|水费|电费|燃气|宽带|家居/.test(text)) return '居家';
  if (/电影|游戏|演出|会员|音乐/.test(text)) return '娱乐';
  if (/医院|药店|诊所|医疗|挂号/.test(text)) return '医疗';
  if (/课程|书店|培训|学费|教育/.test(text)) return '学习';
  return '其他';
}

export function parseOCR(rawText, today = new Date()) {
  const text = normalize(rawText).trim();
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!text) return { status: 'review', reason: '没有识别到文字', type: 'expense', amountCents: null, category: '其他', merchant: '', note: '' };
  const failed = /支付失败|付款失败|收款失败|交易失败|支付中|待支付|待付款|未支付|已取消|交易关闭|退款中/.test(text);
  const income = /收款成功|已收款|到账成功|入账成功|收入成功|退款成功|退款到账/.test(text);
  const expense = /支付成功|付款成功|已支付|支付完成|付款完成|扣款成功|支出成功/.test(text);
  const type = income && !expense ? 'income' : 'expense';
  const amount = findAmount(lines);
  const merchant = findMerchant(lines);
  const note = merchant || (type === 'income' ? '屏幕识别收入' : '屏幕识别支出');
  const category = guessCategory(`${merchant}\n${text}`, type);
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let reason = '';
  if (failed) reason = '画面显示交易未完成，请核对';
  else if (!income && !expense) reason = '没有找到付款或收款成功字样，请核对';
  else if (income && expense) reason = '收支方向不明确，请核对';
  else if (!amount) reason = '没有找到明确的交易金额，请核对';
  else if (amount.score < 3) reason = '金额缺少交易标签，请核对';
  return { status: reason ? 'review' : 'auto', reason, type, amountCents: amount?.cents || null, category, merchant, note, date };
}
