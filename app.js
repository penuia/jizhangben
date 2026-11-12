import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, parseOCR, parsePaymentJSON } from './parser.mjs?v=30';

const STORAGE_KEY = 'xiaozhangben.records.v1';
const BUDGET_KEY = 'xiaozhangben.monthlyBudget.v1';
const CATEGORY_KEY = 'xiaozhangben.customCategories.v1';
const CUSTOM_COLORS = ['#d7919d','#8ab5c9','#a9b899','#e5b271','#a697c6','#9ac7bd'];
const $ = selector => document.querySelector(selector);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const money = cents => '¥' + (Math.abs(cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const newId = () => crypto.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2);
const categories = type => [...(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES), ...customCategories.filter(c => c.type === type)];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T12:00:00').getTime());
const validRecord = r => r && typeof r.id === 'string' && ['expense','income'].includes(r.type) && Number.isSafeInteger(r.amountCents) && r.amountCents > 0 && validDate(r.date) && typeof r.category === 'string' && (r.note === undefined || typeof r.note === 'string') && (r.merchant === undefined || typeof r.merchant === 'string');
const merchantOf = r => r.merchant || r.category || '未分类';
let records = loadRecords();
let customCategories = loadCustomCategories();
let monthlyBudget = Number(localStorage.getItem(BUDGET_KEY) || 0);
let viewingMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let viewingYear = new Date().getFullYear();
let statsPeriod = 'month';
let currentPage = 'home';
let editingId = null;
let entryType = 'expense';
let entryCategory = '餐饮';
let toastTimer;
let openSwipeRow = null;

function loadRecords() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value.filter(validRecord) : []; }
  catch { return []; }
}
function validCustomCategory(c) {
  return c && ['expense','income'].includes(c.type) && typeof c.name === 'string' && c.name.trim() === c.name && c.name.length > 0 && c.name.length <= 12 && typeof c.icon === 'string' && c.icon.length <= 8 && typeof c.color === 'string' && CUSTOM_COLORS.includes(c.color);
}
function loadCustomCategories() {
  try { const value = JSON.parse(localStorage.getItem(CATEGORY_KEY) || '[]'); return Array.isArray(value) ? value.filter(validCustomCategory) : []; }
  catch { return []; }
}
function persistCategories(next) {
  try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(next)); customCategories = next; return true; }
  catch { showToast('分类保存失败'); return false; }
}
function categoryDefinitions(rows, type) {
  const list = categories(type);
  for (const row of rows.filter(r => r.type === type)) {
    if (!list.some(c => c.name === row.category)) list.push({ name: row.category, icon: '✦', color: '#a8b5a9' });
  }
  return list;
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); return true; }
  catch { showToast('保存失败：浏览器存储空间不可用'); return false; }
}
function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function monthKey() { return viewingMonth.getFullYear() + '-' + pad(viewingMonth.getMonth() + 1); }
function monthRows() { return records.filter(r => r.date.startsWith(monthKey())).sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)); }
function setPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('#add-button').hidden = page === 'settings';
  window.scrollTo(0,0);
  render();
}
function shiftMonth(delta) { viewingMonth = new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() + delta, 1); render(); }
function shiftYear(delta) { viewingYear += delta; renderAnnual(); }
function setStatsPeriod(period) {
  statsPeriod = period;
  $('#monthly-stats').hidden = period !== 'month';
  $('#annual-stats').hidden = period !== 'year';
  document.querySelectorAll('.period-switch button').forEach(button => {
    const selected = button.dataset.period === period;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (period === 'year') renderAnnual();
}
function render() {
  const label = viewingMonth.getFullYear() + '年' + (viewingMonth.getMonth() + 1) + '月';
  $('#month-label').textContent = label;
  $('#stats-month-label').textContent = label;
  const rows = monthRows();
  const income = rows.filter(r => r.type === 'income').reduce((s,r) => s + r.amountCents, 0);
  const expense = rows.filter(r => r.type === 'expense').reduce((s,r) => s + r.amountCents, 0);
  $('#balance').textContent = money(expense);
  $('#income-total').textContent = money(income);
  $('#expense-total').textContent = (income < expense ? '−' : '') + money(income - expense);
  const status = $('#budget-status');
  status.classList.toggle('over', monthlyBudget > 0 && expense > monthlyBudget);
  status.textContent = monthlyBudget > 0
    ? expense <= monthlyBudget ? '预算还剩 ' + money(monthlyBudget - expense) : '超出预算 ' + money(expense - monthlyBudget)
    : '每一笔都清清楚楚';
  $('#record-count').textContent = '共 ' + rows.length + ' 笔';
  renderList(rows);
  renderStats(rows, income, expense);
  if (statsPeriod === 'year') renderAnnual();
  renderCustomCategories();
}
function renderList(rows) {
  const el = $('#transaction-list');
  openSwipeRow = null;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><span>○</span><strong>这个月还没有记录</strong><p>点“记一笔”开始记录。</p></div>';
    return;
  }
  const groups = new Map();
  rows.forEach(r => { if (!groups.has(r.date)) groups.set(r.date, []); groups.get(r.date).push(r); });
  el.innerHTML = [...groups].map(([date, items], index) => {
    const parts = date.split('-');
    const weekday = ['周日','周一','周二','周三','周四','周五','周六'][new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay()];
    const heading = Number(parts[1]) + '月' + Number(parts[2]) + '日 · ' + weekday;
    const inner = items.map(r => {
      const cat = categories(r.type).find(c => c.name === r.category);
      const pastel = ['#FCE9EE','#FFF1D8','#E3F1FB'][Math.abs(r.category.charCodeAt(0) || 0) % 3];
      const badge = r.merchant ? '<em class="category-tag">' + escapeHTML(r.category) + '</em>' : '';
      const note = r.note ? '<small>' + escapeHTML(r.note) + '</small>' : '';
      const meta = badge || note ? '<span class="transaction-meta">' + badge + note + '</span>' : '';
      return '<div class="swipe-row"><div class="swipe-actions"><button type="button" class="swipe-edit" tabindex="-1" aria-label="修改' + escapeHTML(merchantOf(r)) + '">修改</button><button type="button" class="swipe-delete" tabindex="-1" aria-label="删除' + escapeHTML(merchantOf(r)) + '">删除</button></div><button type="button" class="transaction-row" data-id="' + escapeHTML(r.id) + '" style="--pastel:' + pastel + '"><span class="category-icon">' + escapeHTML(cat?.icon || '✦') + '</span><span class="transaction-info"><strong>' + escapeHTML(merchantOf(r)) + '</strong>' + meta + '</span><span class="transaction-amount ' + r.type + '">' + (r.type === 'income' ? '+' : '−') + money(r.amountCents) + '</span></button></div>';
    }).join('');
    return '<div class="day-group"><div class="day-heading">' + heading + '</div><div class="transaction-card">' + inner + '</div></div>';
  }).join('');
  el.querySelectorAll('.swipe-row').forEach(row => {
    const front = row.querySelector('.transaction-row');
    let gesture = null;
    let ignoreClickUntil = 0;
    front.addEventListener('click', () => {
      if (Date.now() < ignoreClickUntil) return;
      if (row.classList.contains('is-open')) { setSwipeOpen(row, false); return; }
      openEntry(records.find(r => r.id === front.dataset.id));
    });
    row.querySelector('.swipe-edit').addEventListener('click', () => openEntry(records.find(r => r.id === front.dataset.id)));
    row.querySelector('.swipe-delete').addEventListener('click', () => deleteRecord(front.dataset.id));
    row.addEventListener('touchstart', event => {
      if (event.target.closest('.swipe-actions')) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, open: row.classList.contains('is-open'), dragging: false };
    }, { passive: true });
    row.addEventListener('touchmove', event => {
      if (!gesture) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.dragging && (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2)) return;
      gesture.dragging = true;
      row.classList.add('dragging');
      front.style.transform = 'translateX(' + Math.max(-148, Math.min(0, (gesture.open ? -148 : 0) + dx)) + 'px)';
    }, { passive: true });
    row.addEventListener('touchend', event => {
      if (!gesture) return;
      if (gesture.dragging) {
        const dx = event.changedTouches[0].clientX - gesture.x;
        row.classList.remove('dragging');
        front.style.transform = '';
        setSwipeOpen(row, dx < -45 ? true : dx > 45 ? false : gesture.open);
        ignoreClickUntil = Date.now() + 500;
      }
      gesture = null;
    }, { passive: true });
    row.addEventListener('touchcancel', () => {
      row.classList.remove('dragging');
      front.style.transform = '';
      gesture = null;
    }, { passive: true });
  });
}
function setSwipeOpen(row, open) {
  if (openSwipeRow && openSwipeRow !== row) {
    openSwipeRow.classList.remove('is-open');
    openSwipeRow.querySelectorAll('.swipe-actions button').forEach(button => button.tabIndex = -1);
  }
  row.classList.toggle('is-open', open);
  row.querySelectorAll('.swipe-actions button').forEach(button => button.tabIndex = open ? 0 : -1);
  openSwipeRow = open ? row : null;
}
function renderStats(rows, income, expense) {
  $('#stats-income').textContent = money(income);
  $('#stats-expense').textContent = money(expense);
  $('#expense-count').textContent = rows.filter(r => r.type === 'expense').length;
  const expenseCategories = categoryDefinitions(rows, 'expense');
  renderBreakdown('#category-breakdown', rows.filter(r => r.type === 'expense'), expenseCategories, expense);
  renderBreakdown('#income-breakdown', rows.filter(r => r.type === 'income'), categoryDefinitions(rows, 'income'), income);
  const amounts = expenseCategories.map(cat => ({ cat, amount: rows.filter(r => r.type === 'expense' && r.category === cat.name).reduce((s,r) => s + r.amountCents,0) })).filter(x => x.amount > 0);
  let cursor = 0;
  const stops = amounts.map(x => { const start = cursor; cursor += x.amount / expense * 100; return x.cat.color + ' ' + start + '% ' + cursor + '%'; });
  $('#donut').style.background = stops.length ? 'conic-gradient(' + stops.join(',') + ')' : '#e4eef7';
}
function renderBreakdown(selector, rows, list, total) {
  const parts = list.map(cat => ({ cat, amount: rows.filter(r => r.category === cat.name).reduce((s,r) => s + r.amountCents,0) })).filter(x => x.amount > 0).sort((a,b) => b.amount - a.amount);
  $(selector).innerHTML = parts.length ? parts.map(x => '<div class="breakdown-row"><span class="swatch" style="background:' + x.cat.color + '"></span><span>' + escapeHTML(x.cat.icon) + ' ' + escapeHTML(x.cat.name) + '<small>' + Math.round(x.amount / total * 100) + '%</small></span><strong>' + money(x.amount) + '</strong></div>').join('') : '<p class="no-data">暂无记录</p>';
}
function renderAnnual() {
  const year = String(viewingYear);
  const rows = records.filter(r => r.date.startsWith(year + '-'));
  const income = rows.filter(r => r.type === 'income').reduce((sum,r) => sum + r.amountCents, 0);
  const expense = rows.filter(r => r.type === 'expense').reduce((sum,r) => sum + r.amountCents, 0);
  $('#year-label').textContent = year + '年';
  $('#year-income').textContent = money(income);
  $('#year-expense').textContent = money(expense);
  $('#year-balance').textContent = (income < expense ? '−' : '') + money(income - expense);
  const months = Array.from({ length: 12 }, (_, index) => {
    const monthRows = rows.filter(r => Number(r.date.slice(5,7)) === index + 1);
    return { month: index + 1, income: monthRows.filter(r => r.type === 'income').reduce((sum,r) => sum + r.amountCents, 0), expense: monthRows.filter(r => r.type === 'expense').reduce((sum,r) => sum + r.amountCents, 0) };
  });
  const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
  $('#annual-months').innerHTML = months.map(m => '<div class="annual-month-row"><span class="annual-month-label">' + m.month + '月</span><div class="annual-bars"><div class="annual-bar-line"><span class="annual-bar income-bar" style="width:' + (m.income / max * 100).toFixed(2) + '%"></span></div><div class="annual-bar-line"><span class="annual-bar expense-bar" style="width:' + (m.expense / max * 100).toFixed(2) + '%"></span></div></div><div class="annual-values"><span>' + money(m.income) + '</span><span>' + money(m.expense) + '</span></div></div>').join('');
  renderBreakdown('#annual-expense-breakdown', rows.filter(r => r.type === 'expense'), categoryDefinitions(rows, 'expense'), expense);
  renderBreakdown('#annual-income-breakdown', rows.filter(r => r.type === 'income'), categoryDefinitions(rows, 'income'), income);
}
function renderCustomCategories() {
  const el = $('#custom-category-list');
  el.innerHTML = customCategories.length ? customCategories.map(c => '<div class="custom-category-row"><span class="custom-category-icon">' + escapeHTML(c.icon || '✦') + '</span><span>' + escapeHTML(c.name) + '</span><small>' + (c.type === 'income' ? '收入' : '支出') + '</small><button type="button" data-type="' + c.type + '" data-name="' + escapeHTML(c.name) + '" aria-label="删除' + escapeHTML(c.name) + '分类">删除</button></div>').join('') : '<p class="no-data">还没有自定义分类</p>';
  el.querySelectorAll('button').forEach(button => button.addEventListener('click', () => removeCustomCategory(button.dataset.type, button.dataset.name)));
}
function addCustomCategory(event) {
  event.preventDefault();
  const type = $('#new-category-type').value;
  const name = $('#new-category-name').value.trim();
  const icon = $('#new-category-icon').value.trim() || '✦';
  if (!name || name.length > 12) { showToast('分类名称需在 1 到 12 个字以内'); return; }
  if (categories(type).some(c => c.name === name)) { showToast('这个分类已经存在'); return; }
  const color = CUSTOM_COLORS[customCategories.length % CUSTOM_COLORS.length];
  const next = [...customCategories, { type, name, icon, color }];
  if (!persistCategories(next)) return;
  $('#new-category-name').value = '';
  $('#new-category-icon').value = '';
  render();
  showToast('分类已添加');
}
function removeCustomCategory(type, name) {
  if (!window.confirm('删除“' + name + '”分类？已有账目会保留。')) return;
  const next = customCategories.filter(c => !(c.type === type && c.name === name));
  if (!persistCategories(next)) return;
  render();
  showToast('分类已删除，已有账目不变');
}
function renderCategories() {
  const list = categories(entryType);
  if (!list.some(c => c.name === entryCategory)) {
    if (editingId && entryCategory) list.push({ name: entryCategory, icon: '✦', color: '#a8b5a9' });
    else entryCategory = list[0].name;
  }
  $('#category-picker').innerHTML = list.map(cat => '<button type="button" data-category="' + escapeHTML(cat.name) + '" class="' + (cat.name === entryCategory ? 'selected' : '') + '"><span>' + escapeHTML(cat.icon) + '</span>' + escapeHTML(cat.name) + '</button>').join('');
  $('#category-picker').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { entryCategory = button.dataset.category; renderCategories(); }));
  document.querySelectorAll('.type-switch button').forEach(button => button.classList.toggle('selected', button.dataset.type === entryType));
}
function openEntry(row = null) {
  if (openSwipeRow) setSwipeOpen(openSwipeRow, false);
  editingId = row?.id || null;
  entryType = row?.type || 'expense';
  entryCategory = row?.category || (entryType === 'income' ? '工资' : '餐饮');
  $('#dialog-title').textContent = editingId ? '编辑记录' : '记一笔';
  $('#ocr-review-message').hidden = true;
  $('#entry-amount').value = row ? (row.amountCents / 100).toFixed(2) : '';
  $('#entry-merchant').value = row?.merchant || '';
  $('#entry-date').value = row?.date || today();
  $('#entry-note').value = row?.note || '';
  $('#delete-entry').hidden = !editingId;
  renderCategories();
  $('#entry-dialog').showModal();
  $('#entry-dialog').focus({ preventScroll: true });
}
function closeEntry() { $('#entry-dialog').close(); editingId = null; }
function parseAmount(raw) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return null;
  return Math.round(Number(raw) * 100);
}
function saveEntry(event) {
  event.preventDefault();
  const cents = parseAmount($('#entry-amount').value.trim());
  if (!cents) { showToast('请输入正确金额，最多两位小数'); $('#entry-amount').focus(); return; }
  const merchant = $('#entry-merchant').value.trim();
  const date = $('#entry-date').value;
  if (!validDate(date)) { showToast('请选择正确日期'); return; }
  const previous = records;
  const old = records.find(r => r.id === editingId);
  const row = { id: editingId || newId(), type: entryType, amountCents: cents, merchant, category: entryCategory, date, note: $('#entry-note').value.trim(), createdAt: old?.createdAt || Date.now() };
  records = editingId ? records.map(r => r.id === editingId ? row : r) : [...records,row];
  if (!persist()) { records = previous; return; }
  viewingMonth = new Date(Number(date.slice(0,4)), Number(date.slice(5,7)) - 1, 1);
  closeEntry();
  setPage('home');
  showToast(old ? '记录已更新' : '记账成功');
}
function deleteRecord(id) {
  if (!id || !window.confirm('确定删除这笔记录吗？')) return;
  const previous = records;
  records = records.filter(r => r.id !== id);
  if (!persist()) { records = previous; return; }
  if ($('#entry-dialog').open) closeEntry();
  render();
  showToast('已删除这笔记录');
}
function deleteEntry() { deleteRecord(editingId); }
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g,'""') + '"';
}
function exportCSV() {
  const rows = [['日期','类型','金额','商户或来源','分类','备注'], ...[...records].sort((a,b) => a.date.localeCompare(b.date)).map(r => [r.date, r.type === 'income' ? '收入' : '支出', (r.amountCents / 100).toFixed(2), r.merchant || '', r.category, r.note || ''])];
  download('记账本-' + today() + '.csv', '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  showToast('CSV 已导出');
}
function exportJSON() {
  download('记账本备份-' + today() + '.json', JSON.stringify({ app:'小账本', version:2, exportedAt:new Date().toISOString(), records, customCategories, monthlyBudget }, null, 2), 'application/json');
  showToast('完整备份已导出');
}
async function importJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== '小账本' || ![1,2].includes(data.version) || !Array.isArray(data.records) || !data.records.every(validRecord)) throw new Error('bad file');
    if (data.version === 2 && (!Array.isArray(data.customCategories) || !data.customCategories.every(validCustomCategory) || !Number.isSafeInteger(data.monthlyBudget) || data.monthlyBudget < 0)) throw new Error('bad file');
    const question = data.version === 2 ? '将用备份替换当前账目、分类和预算，继续吗？' : '将用备份中的 ' + data.records.length + ' 笔记录替换当前账目，继续吗？';
    if (!window.confirm(question)) return;
    const previous = { records, customCategories, monthlyBudget, recordRaw:localStorage.getItem(STORAGE_KEY), categoryRaw:localStorage.getItem(CATEGORY_KEY), budgetRaw:localStorage.getItem(BUDGET_KEY) };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.records));
      if (data.version === 2) {
        localStorage.setItem(CATEGORY_KEY, JSON.stringify(data.customCategories));
        localStorage.setItem(BUDGET_KEY, String(data.monthlyBudget));
      }
    } catch {
      for (const [key, value] of [[STORAGE_KEY, previous.recordRaw], [CATEGORY_KEY, previous.categoryRaw], [BUDGET_KEY, previous.budgetRaw]]) {
        try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {}
      }
      showToast('恢复失败：浏览器存储空间不可用');
      return;
    }
    records = data.records;
    if (data.version === 2) { customCategories = data.customCategories; monthlyBudget = data.monthlyBudget; $('#monthly-budget').value = monthlyBudget ? (monthlyBudget / 100).toFixed(2) : ''; }
    render();
    showToast('已恢复 ' + records.length + ' 笔记录');
  } catch { showToast('备份文件格式不正确'); }
  finally { event.target.value = ''; }
}
async function mergeJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== '小账本' || ![1,2].includes(data.version) || !Array.isArray(data.records) || !data.records.every(validRecord)) throw new Error('bad file');
    if (data.version === 2 && (!Array.isArray(data.customCategories) || !data.customCategories.every(validCustomCategory) || !Number.isSafeInteger(data.monthlyBudget) || data.monthlyBudget < 0)) throw new Error('bad file');
    const knownIds = new Set(records.map(row => row.id));
    const additions = data.records.filter(row => { if (knownIds.has(row.id)) return false; knownIds.add(row.id); return true; });
    const knownCategories = new Set([...EXPENSE_CATEGORIES.map(c => 'expense:' + c.name), ...INCOME_CATEGORIES.map(c => 'income:' + c.name), ...customCategories.map(c => c.type + ':' + c.name)]);
    const categoryAdditions = (data.version === 2 ? data.customCategories : []).filter(c => { const key = c.type + ':' + c.name; if (knownCategories.has(key)) return false; knownCategories.add(key); return true; });
    if (!additions.length && !categoryAdditions.length) { showToast('备份中没有新账目或分类'); return; }
    if (!window.confirm('将添加 ' + additions.length + ' 笔新账目、' + categoryAdditions.length + ' 个分类；当前账目和预算会保留。继续吗？')) return;
    const nextRecords = [...records, ...additions];
    const nextCategories = [...customCategories, ...categoryAdditions];
    const previousRecordRaw = localStorage.getItem(STORAGE_KEY);
    const previousCategoryRaw = localStorage.getItem(CATEGORY_KEY);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(nextCategories));
    } catch {
      for (const [key, value] of [[STORAGE_KEY, previousRecordRaw], [CATEGORY_KEY, previousCategoryRaw]]) {
        try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {}
      }
      showToast('合并失败：浏览器存储空间不可用');
      return;
    }
    records = nextRecords;
    customCategories = nextCategories;
    render();
    showToast('已合并 ' + additions.length + ' 笔新账目');
  } catch { showToast('备份文件格式不正确'); }
  finally { event.target.value = ''; }
}
function saveBudget() {
  const raw = $('#monthly-budget').value.trim();
  const cents = raw ? parseAmount(raw) : 0;
  if (raw && !cents) { showToast('请输入正确的预算金额'); return; }
  try { localStorage.setItem(BUDGET_KEY, String(cents)); monthlyBudget = cents; render(); showToast('月度预算已保存'); }
  catch { showToast('预算保存失败'); }
}
function showShortcutCard(row) {
  $('#shortcut-detail').textContent = merchantOf(row) + ' · ' + money(row.amountCents);
  $('#shortcut-card').hidden = false;
}
function reviewOCR(result) {
  openEntry();
  entryType = result.type;
  entryCategory = categories(entryType).some(c => c.name === result.category) ? result.category : '其他';
  renderCategories();
  $('#dialog-title').textContent = '核对识别结果';
  $('#ocr-review-message').textContent = result.reason || '请核对金额和分类后保存';
  $('#ocr-review-message').hidden = false;
  $('#entry-amount').value = result.amountCents ? (result.amountCents / 100).toFixed(2) : '';
  $('#entry-merchant').value = result.merchant || '';
  $('#entry-date').value = result.date || today();
  $('#entry-note').value = result.note || '';
}
function saveShortcutResult(result) {
  if (result.status !== 'auto') { reviewOCR(result); return false; }
  const row = { id:newId(), type:result.type, amountCents:result.amountCents, merchant:result.merchant || '', category:result.category, date:result.date, note:result.note || '', createdAt:Date.now() };
  const previous = records;
  records = [...records,row];
  if (!persist()) { records = previous; return false; }
  viewingMonth = new Date(Number(row.date.slice(0,4)), Number(row.date.slice(5,7)) - 1, 1);
  setPage('home');
  showShortcutCard(row);
  return true;
}
function recordFromOCR(rawText) {
  return saveShortcutResult(parseOCR(rawText));
}
function recordFromJSON(rawJSON) {
  const result = parsePaymentJSON(rawJSON);
  if (result.status === 'error') { showToast(result.reason); return false; }
  return saveShortcutResult(result);
}
function captureFromURL() {
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const queryParams = new URLSearchParams(location.search);
  const params = hashParams.has('record') || hashParams.has('ocr') || hashParams.has('amount') ? hashParams : queryParams.has('amount') ? queryParams : null;
  if (!params) return;
  history.replaceState(null, '', location.pathname);
  if (params.has('record')) {
    recordFromJSON(params.get('record') || '');
    return;
  }
  if (params.has('ocr')) {
    recordFromOCR(params.get('ocr') || '');
    return;
  }
  const cents = parseAmount((params.get('amount') || '').trim());
  if (!cents) { showToast('快捷指令金额无效，未保存'); return; }
  const type = params.get('type') === 'income' ? 'income' : 'expense';
  const merchant = (params.get('merchant') || '').trim().slice(0,60);
  const incomingCategory = (params.get('category') || '').trim();
  const category = categories(type).some(c => c.name === incomingCategory) ? incomingCategory : '其他';
  const incomingDate = params.get('date') || today();
  const date = validDate(incomingDate) ? incomingDate : today();
  const row = { id:newId(), type, amountCents:cents, merchant, category, date, note:'', createdAt:Date.now() };
  const previous = records;
  records = [...records,row];
  if (!persist()) { records = previous; return; }
  viewingMonth = new Date(Number(date.slice(0,4)), Number(date.slice(5,7)) - 1, 1);
  setPage('home');
  showShortcutCard(row);
}
async function copyShortcutURL() {
  const base = new URL('./', location.href);
  base.hash = 'ocr=';
  try { await navigator.clipboard.writeText(base.href); showToast('截屏识别网址前缀已复制'); }
  catch { showToast('复制失败，请手动复制网址'); }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
$('#open-settings').addEventListener('click', () => setPage('settings'));
$('#prev-month').addEventListener('click', () => shiftMonth(-1));
$('#next-month').addEventListener('click', () => shiftMonth(1));
$('#stats-prev').addEventListener('click', () => shiftMonth(-1));
$('#stats-next').addEventListener('click', () => shiftMonth(1));
$('#year-prev').addEventListener('click', () => shiftYear(-1));
$('#year-next').addEventListener('click', () => shiftYear(1));
document.querySelectorAll('.period-switch button').forEach(button => button.addEventListener('click', () => setStatsPeriod(button.dataset.period)));
$('#add-button').addEventListener('click', () => openEntry());
$('#close-entry').addEventListener('click', closeEntry);
$('#entry-form').addEventListener('submit', saveEntry);
$('#delete-entry').addEventListener('click', deleteEntry);
$('#entry-dialog').addEventListener('click', e => { if (e.target === $('#entry-dialog')) closeEntry(); });
document.querySelectorAll('.type-switch button').forEach(button => button.addEventListener('click', () => { entryType = button.dataset.type; entryCategory = entryType === 'income' ? '工资' : '餐饮'; renderCategories(); }));
$('#save-budget').addEventListener('click', saveBudget);
$('#category-form').addEventListener('submit', addCustomCategory);
$('#export-csv').addEventListener('click', exportCSV);
$('#export-json').addEventListener('click', exportJSON);
$('#import-file').addEventListener('change', importJSON);
$('#merge-file').addEventListener('change', mergeJSON);
$('#copy-shortcut-url').addEventListener('click', copyShortcutURL);
$('#close-shortcut-card').addEventListener('click', () => { $('#shortcut-card').hidden = true; });
window.addEventListener('hashchange', captureFromURL);
$('#monthly-budget').value = monthlyBudget > 0 ? (monthlyBudget / 100).toFixed(2) : '';
render();
setStatsPeriod('month');
captureFromURL();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('./sw.js').catch(() => {});
