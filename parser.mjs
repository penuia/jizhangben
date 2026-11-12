export const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', color: '#e7a96c' }, { name: '购物', icon: '🛍️', color: '#d7919d' },
  { name: '交通', icon: '🚇', color: '#8ab5c9' }, { name: '居家', icon: '🏠', color: '#a9b899' },
  { name: '娱乐', icon: '🎬', color: '#a697c6' }, { name: '医疗', icon: '💊', color: '#9ac7bd' },
  { name: '学习', icon: '📚', color: '#bda887' }, { name: '日常', icon: '☁️', color: '#a8b5a9' },
  { name: '其他', icon: '•••', color: '#a8b5a9' }
];
export const INCOME_CATEGORIES = [
  { name: '工资', icon: '💼', color: '#70ae88' }, { name: '奖金', icon: '🎁', color: '#e5b271' },
  { name: '兼职', icon: '✨', color: '#9aafcb' }, { name: '退款', icon: '↩️', color: '#aa9bc0' },
  { name: '其他', icon: '•••', color: '#a8b5a9' }
];

function decodeShortcutText(value) {
  let text = String(value || '');
  // Shortcuts may URL-encode its output more than once before Safari parses the URL.
  for (let i = 0; i < 6 && /%[0-9a-f]{2}/i.test(text); i++) {
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
    if (/余额|优惠|红包|积分|优惠券|推荐|广告|手续费|原价|剩余|抵扣|折扣|省了|付款方式|银行卡|尾号/.test(line)) continue;
    const previous = lines[i - 1] || '';
    let cents = amountFromLine(line);
    if (cents === null && (strongAmountLabel.test(previous) || amountLabel.test(previous)) && /^\s*[-−]?\s*¥?\s*\d{1,8}(?:\.\d{1,2})?\s*$/.test(line)) {
      cents = Math.round(Number(line.replace(/[^\d.]/g, '')) * 100);
    }
    const standalone = /^\s*[-−]\s*\d{1,8}\.\d{1,2}\s*$/.test(line);
    if (cents === null && standalone && i < 18 && /支付成功|付款成功|交易成功|交易已完成|等待确认收货|已发货/.test(lines.slice(i + 1, i + 5).join(' '))) {
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
    if (/余额|优惠|红包|积分|优惠券|推荐|广告|手续费|原价|剩余|抵扣|折扣|省了|银行卡|尾号|时间|日期|订单号/.test(line) || /20\d{2}\s*[-/.年]\s*\d{1,2}/.test(line)) continue;
    const match = line.replace(/,/g, '').match(/(?<!\d)(\d{1,8}\.\d{1,2})(?!\d)/);
    if (!match) continue;
    const cents = Math.round(Number(match[1]) * 100);
    if (Number.isSafeInteger(cents) && cents > 0 && cents <= 10000000000) return { cents, score: 1, index: i };
  }
  return null;
}

const merchantLabel = /^(?:商户全称|商户名称|商户|收款方全称|收款方名称|收款方|付款给|转账给|收款人|交易对方|对方名称|对方|店铺名称|店铺|商家名称|商家)\s*[:：]?\s*(.*)$/;
const productLabel = /^(?:商品\/服务|商品说明|商品名称|商品详情|商品信息|订单商品|交易商品|交易内容|付款说明|购买商品|商品)\s*[:：]?\s*(.*)$/;
const wechatItemLabel = /^商品(?!说明|名称|详情|信息)\s*[:：]?\s*(.*)$/;
const alipayDescriptionLabel = /^商品说明\s*[:：]?\s*(.*)$/;
const detailNoise = /^(?:微信支付|支付宝|支付成功|付款成功|收款成功|交易成功|账单详情|订单详情|交易详情|支付详情|当前状态|交易状态|交易服务|账单管理|订单号|交易单号|商户单号|单号|流水号|付款方式|支付方式|支付奖励|立即领取|查看扣款顺序|收单机构|银行卡|复制|完成|查看详情|感谢使用|积分|优惠券|广告|¥|\d{1,2}:\d{2}(?::\d{2})?$)/;
const nextFieldLabel = /^(?:商户全称|商户名称|商户|商家名称|付款给|转账给|收款方全称|收款方名称|收款方|收单机构|付款方式|支付方式|支付时间|交易时间|商品说明|商品名称|商品|交易单号|商户单号|账单分类|备注)/;

function cleanDetail(value) {
  const cleaned = String(value || '').replace(/^[\s:：·•—-]+/, '').replace(/[-－—]?\s*[A-Za-z0-9]{20,}(?:\s*\d+)?$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return cleaned.length >= 2 && !detailNoise.test(cleaned) && !/%[0-9a-f]{2}/i.test(cleaned) && !/^[+\-\d.,\s]+$/.test(cleaned) && !/^[A-Za-z0-9-]{20,}$/.test(cleaned) && !merchantLabel.test(cleaned) && !productLabel.test(cleaned) && !dateLabel.test(cleaned) ? cleaned : '';
}

function findPlatform(lines, amount, text) {
  const header = lines.slice(0, amount?.index ?? 15).join(' ');
  if (/美团/.test(header)) return /美团外卖|外卖微信小程序|特价外卖团购/.test(text) ? '美团外卖' : '美团';
  if (/天猫/.test(header)) return '天猫';
  if (/淘宝/.test(header)) return '淘宝';
  if (/京东/.test(header)) return '京东';
  if (/拼多多/.test(header)) return '拼多多';
  return '';
}

function findLabeledDetail(lines, label) {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(label);
    if (!match) continue;
    const inline = cleanDetail(match[1]);
    if (inline) {
      const continuation = lines[i + 1] || '';
      if ((label === productLabel || label === alipayDescriptionLabel) && /[A-Za-z]$/.test(inline) && /^[A-Za-z]{2,16}$/.test(continuation)) return (inline + continuation).slice(0, 60);
      return inline;
    }
    const limit = label === merchantLabel ? 1 : 2;
    for (let offset = 1; offset <= limit; offset++) {
      const raw = lines[i + offset] || '';
      if (!raw || nextFieldLabel.test(raw)) break;
      const next = cleanDetail(raw);
      if (!next) continue;
      const continuation = lines[i + offset + 1] || '';
      if ((label === productLabel || label === alipayDescriptionLabel) && /[A-Za-z]$/.test(next) && /^[A-Za-z]{2,16}$/.test(continuation)) return (next + continuation).slice(0, 60);
      return next;
    }
  }
  return '';
}

function findMerchant(lines) {
  const labeled = findLabeledDetail(lines, merchantLabel);
  if (labeled) return { name: labeled, needsReview: false };
  return { name: '', needsReview: false };
}

const paymentCategoryRules = [
  ['餐饮', /美团外卖|咖啡|麦当劳|便利店|便利超市|超市|餐饮|小吃|饭店|餐厅|外卖|食品|奶茶|火锅|面馆|肯德基|7[- ]?ELEVEN|711|全家|罗森|瑞幸|星巴克|库迪|Manner|饿了么|水果/i],
  ['交通', /美团打车|滴滴|高德|地铁|公交|加油|停车|打车|高铁|机票|出行/],
  ['购物', /淘宝|京东|拼多多|天猫|猫咪|购物|商城|服饰|日用品|优衣库/],
  ['娱乐', /影城|KTV|网易云|腾讯视频|视频会员|电影|游戏|演出|音乐/i]
];

export function classifyPayment(merchant = '', product = '') {
  // Only use the merchant and product. The rest of the screen can contain ads and rewards.
  for (const source of [merchant, product]) {
    for (const [category, pattern] of paymentCategoryRules) {
      if (pattern.test(source)) return category;
    }
  }
  return '日常';
}

function guessIncomeCategory(text) {
  if (/退款|退货|退回/.test(text)) return '退款';
  if (/工资|薪资|薪酬/.test(text)) return '工资';
  if (/奖金|红包|补贴/.test(text)) return '奖金';
  if (/兼职|稿费|劳务/.test(text)) return '兼职';
  return '其他';
}

export function parseOCR(rawText, today = new Date()) {
  const text = normalize(rawText).trim();
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!text) return { status: 'review', reason: '没有识别到文字', type: 'expense', amountCents: null, category: '日常', merchant: '', note: '' };
  const failed = /支付失败|付款失败|收款失败|交易失败|支付中|待支付|待付款|未支付|已取消|交易关闭|退款中/.test(text);
  const income = /收款成功|已收款|到账成功|入账成功|收入成功|退款成功|退款到账/.test(text);
  const explicitExpense = /支付成功|付款成功|已支付|支付完成|付款完成|扣款成功|支出成功|交易成功|交易已完成|订单已完成/.test(text);
  const amount = findAmount(lines);
  const expense = explicitExpense || (/等待确认收货|已发货/.test(text) && /支付时间|付款时间/.test(text) && amount?.score >= 3);
  const type = income && !expense ? 'income' : 'expense';
  const product = findLabeledDetail(lines, productLabel);
  const wechatItem = findLabeledDetail(lines, wechatItemLabel);
  const alipayDescription = findLabeledDetail(lines, alipayDescriptionLabel);
  const merchantResult = findMerchant(lines);
  const alipay = /支付宝|商品说明|支付奖励|收款方全称/.test(text);
  const wechat = /微信支付|商户全称|财付通|交易单号/.test(text) && !alipay;
  const aboveAmount = amount?.index > 0 ? cleanDetail(lines[amount.index - 1]) : '';
  const belowAmount = amount && amount.index + 1 < lines.length ? cleanDetail(lines[amount.index + 1]) : '';
  const platform = findPlatform(lines, amount, text);
  const clearAboveAmount = /[*＊]{2,}/.test(aboveAmount) ? '' : aboveAmount;
  const clearLabeledMerchant = /[*＊]{2,}/.test(merchantResult.name) ? '' : merchantResult.name;
  const preferredMerchant = platform === '美团外卖' ? platform : alipay ? (alipayDescription || clearLabeledMerchant || clearAboveAmount || platform) : wechat ? (wechatItem || clearLabeledMerchant || clearAboveAmount || platform || belowAmount) : (clearAboveAmount || clearLabeledMerchant || platform || wechatItem || alipayDescription || product);
  const merchant = preferredMerchant || (type === 'expense' ? '线上消费' : '');
  const note = product && product !== merchant ? '商品：' + product : '';
  const category = type === 'income' ? guessIncomeCategory([merchant, product, text].join(' ')) : classifyPayment(merchant, product);
  const foundDate = findDate(lines, today);
  const date = foundDate.date;
  let reason = '';
  if (failed) reason = '画面显示交易未完成，请核对';
  else if (!income && !expense) reason = '没有找到交易成功或收付款完成提示，请核对';
  else if (income && expense) reason = '收支方向不明确，请核对';
  else if (!amount) reason = '没有找到明确的交易金额，请核对';
  else if (amount.score < 3) reason = '金额缺少交易标签，请核对';
  else if (foundDate.reason) reason = foundDate.reason;
  else if (!preferredMerchant && merchantResult.needsReview) reason = '商户名称由画面推测，请核对';
  return { status: reason ? 'review' : 'auto', reason, type, amountCents: amount?.cents || null, category, merchant, product, note, date };
}

export function parsePaymentJSON(raw, today = new Date()) {
  let value;
  try { value = JSON.parse(decodeShortcutText(raw).trim()); }
  catch { return { status: 'error', reason: '识别结果不是有效 JSON，未保存' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'error', reason: '识别结果格式不正确，未保存' };
  const amount = value.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    return { status: 'error', reason: '识别金额无效，未保存' };
  }
  const merchant = typeof value.merchant === 'string' ? cleanDetail(value.merchant) : '';
  const validCategory = ['餐饮', '购物', '交通', '娱乐', '日常'].includes(value.category);
  const category = validCategory ? value.category : classifyPayment(merchant);
  const candidateDate = typeof value.date === 'string' ? value.date : '';
  const dateParts = candidateDate.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  const parsedDate = dateParts && calendarDate(Number(dateParts[1]), Number(dateParts[2]), Number(dateParts[3]));
  const date = parsedDate ? formatDate(parsedDate) : formatDate(today);
  const reason = !merchant ? '未能确认商户，请核对后保存' : !validCategory ? '分类不在五种类别中，请核对后保存' : candidateDate && !parsedDate ? '交易日期无效，请核对后保存' : '';
  return { status: reason ? 'review' : 'auto', reason, type: 'expense', amountCents: Math.round(amount * 100), merchant, category, date, note: '' };
}
