/**
 * 纸上交易日志 - 核心逻辑
 * app.js
 *
 * 功能：
 *  - 交易录入、编辑、删除
 *  - 平仓结算（自动计算盈亏金额、百分比、持仓天数）
 *  - 复盘总结管理
 *  - 统计仪表盘（胜率、盈亏比、连续盈亏等）
 *  - Chart.js 图表（累计盈亏曲线、胜率饼图、各标的柱状图）
 *  - JSON 数据导入/导出/清空
 *  - 全部数据存储于 localStorage
 */

'use strict';

// ==========================================
// 常量 & 存储键
// ==========================================

const STORAGE_KEY = 'ptj_trades';

// ==========================================
// 数据层
// ==========================================

/**
 * 从 localStorage 读取所有交易记录
 * @returns {Array} 交易记录数组
 */
function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('读取数据失败', e);
    return [];
  }
}

/**
 * 将交易记录数组保存到 localStorage
 * @param {Array} trades
 */
function saveTrades(trades) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (e) {
    console.error('保存数据失败', e);
    showToast('保存失败，localStorage 可能已满', 'error');
  }
}

/**
 * 生成唯一 ID（时间戳 + 随机数）
 * @returns {string}
 */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ==========================================
// 计算工具
// ==========================================

/**
 * 计算两个日期之间的天数差
 * @param {string} dateA - ISO 日期字符串 (YYYY-MM-DD)
 * @param {string} dateB - ISO 日期字符串 (YYYY-MM-DD)
 * @returns {number}
 */
function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs((b - a) / 86400000));
}

/**
 * 格式化盈亏数字
 * @param {number} val
 * @returns {string}
 */
function fmtPnl(val) {
  if (val === null || val === undefined) return '–';
  const sign = val >= 0 ? '+' : '';
  return sign + val.toFixed(2);
}

/**
 * 格式化百分比
 * @param {number} val
 * @returns {string}
 */
function fmtPct(val) {
  if (val === null || val === undefined) return '–';
  const sign = val >= 0 ? '+' : '';
  return sign + val.toFixed(2) + '%';
}

/**
 * 格式化金额（千分位）
 * @param {number} val
 * @returns {string}
 */
function fmtMoney(val) {
  if (val === null || val === undefined) return '–';
  const sign = val >= 0 ? '+' : '';
  return sign + val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==========================================
// Toast 提示
// ==========================================

/**
 * 显示底部 Toast 通知
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ==========================================
// 模态框通用逻辑
// ==========================================

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// 绑定所有带 data-close 的关闭按钮
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// 点击蒙层关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ==========================================
// Tab 导航
// ==========================================

const tabs = document.querySelectorAll('.nav-tab');
const panels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  if (tabName === 'dashboard' || tabName === 'charts') {
    renderCharts();
  }
  if (tabName === 'data') {
    renderStorageInfo();
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// 快速录入按钮
document.getElementById('quickAddBtn').addEventListener('click', () => switchTab('entry'));

// ==========================================
// 表单：录入 & 编辑
// ==========================================

let editingId = null; // 当前编辑的记录 ID（null 表示新增模式）

const form = document.getElementById('tradeForm');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editHint = document.getElementById('editHint');
const editIdHint = document.getElementById('editIdHint');

// 设置日期默认值为今天
document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);

/**
 * 重置表单到新增模式
 */
function resetForm() {
  form.reset();
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  editingId = null;
  submitBtn.textContent = '✅ 保存交易';
  cancelEditBtn.style.display = 'none';
  editHint.style.display = 'none';
}

/**
 * 填充表单进入编辑模式
 * @param {Object} trade
 */
function enterEditMode(trade) {
  editingId = trade.id;
  document.getElementById('f-date').value = trade.date;
  document.getElementById('f-symbol').value = trade.symbol;
  document.getElementById('f-action').value = trade.action;
  document.getElementById('f-price').value = trade.price;
  document.getElementById('f-qty').value = trade.qty;
  document.getElementById('f-stoploss').value = trade.stoploss || '';
  document.getElementById('f-target').value = trade.target || '';
  document.getElementById('f-reason').value = trade.reason || '';
  document.getElementById('f-note').value = trade.note || '';
  submitBtn.textContent = '💾 保存修改';
  cancelEditBtn.style.display = 'inline-flex';
  editHint.style.display = 'inline';
  editIdHint.textContent = trade.id;
  switchTab('entry');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

cancelEditBtn.addEventListener('click', resetForm);

form.addEventListener('submit', e => {
  e.preventDefault();

  const price = parseFloat(document.getElementById('f-price').value);
  const qty = parseInt(document.getElementById('f-qty').value, 10);

  if (isNaN(price) || price <= 0) {
    showToast('请输入有效价格', 'error');
    return;
  }
  if (isNaN(qty) || qty <= 0) {
    showToast('请输入有效数量', 'error');
    return;
  }

  const tradeData = {
    date: document.getElementById('f-date').value,
    symbol: document.getElementById('f-symbol').value.trim(),
    action: document.getElementById('f-action').value,
    price,
    qty,
    stoploss: parseFloat(document.getElementById('f-stoploss').value) || null,
    target: parseFloat(document.getElementById('f-target').value) || null,
    reason: document.getElementById('f-reason').value.trim(),
    note: document.getElementById('f-note').value.trim(),
  };

  const trades = loadTrades();

  if (editingId) {
    // 编辑模式：找到对应记录并更新
    const idx = trades.findIndex(t => t.id === editingId);
    if (idx !== -1) {
      trades[idx] = { ...trades[idx], ...tradeData };
      saveTrades(trades);
      showToast('记录已更新 ✓');
    }
    resetForm();
  } else {
    // 新增模式
    const newTrade = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: 'open',        // open | closed
      closeDate: null,
      closePrice: null,
      pnl: null,             // 盈亏金额
      pnlPct: null,          // 盈亏百分比
      holdDays: null,        // 持仓天数
      review: '',            // 复盘总结
      ...tradeData,
    };
    trades.push(newTrade);
    saveTrades(trades);
    showToast('交易记录已保存 ✓');
    resetForm();
  }

  renderRecords();
  renderStats();
});

// ==========================================
// 交易记录渲染
// ==========================================

/**
 * 渲染交易记录表格
 */
function renderRecords() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filterStatus = document.getElementById('filterStatus').value;
  const filterAction = document.getElementById('filterAction').value;

  let trades = loadTrades();

  // 按日期倒序排列
  trades.sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));

  // 过滤
  const filtered = trades.filter(t => {
    if (search && !t.symbol.toLowerCase().includes(search)) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterAction !== 'all' && t.action !== filterAction) return false;
    return true;
  });

  const tbody = document.getElementById('recordsBody');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('recordCount');
  countEl.textContent = `共 ${filtered.length} 条`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    document.getElementById('recordsTableWrapper').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  document.getElementById('recordsTableWrapper').style.display = 'block';

  tbody.innerHTML = filtered.map((t, i) => {
    const isBuy = t.action === 'buy';
    const amount = (t.price * t.qty).toFixed(2);

    // 盈亏显示（仅平仓记录）
    let pnlHtml = '<span class="neutral-text">–</span>';
    let pnlPctHtml = '<span class="neutral-text">–</span>';
    if (t.status === 'closed' && t.pnl !== null) {
      const cls = t.pnl >= 0 ? 'profit-text' : 'loss-text';
      pnlHtml = `<span class="${cls}">${fmtMoney(t.pnl)}</span>`;
      pnlPctHtml = `<span class="${cls}">${fmtPct(t.pnlPct)}</span>`;
    }

    // 持仓天数
    const holdDaysHtml = t.status === 'closed' && t.holdDays !== null
      ? `${t.holdDays}天`
      : t.status === 'open'
        ? `<span class="neutral-text">${daysBetween(t.date, new Date().toISOString().slice(0, 10))}天</span>`
        : '–';

    // 状态标签
    const statusTag = t.status === 'open'
      ? '<span class="tag tag-open">持仓中</span>'
      : '<span class="tag tag-closed">已平仓</span>';

    // 操作按钮
    const closeBtn = t.status === 'open'
      ? `<button class="btn btn-sm btn-success" onclick="openCloseModal('${t.id}')">平仓</button>`
      : '';

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:12px;">${filtered.length - i}</td>
        <td>${t.date}</td>
        <td style="font-weight:600;">${escHtml(t.symbol)}</td>
        <td><span class="tag ${isBuy ? 'tag-buy' : 'tag-sell'}">${isBuy ? '买入' : '卖出'}</span></td>
        <td>${t.price.toFixed(3)}</td>
        <td>${t.qty.toLocaleString()}</td>
        <td style="color:var(--text-secondary);">${Number(amount).toLocaleString('zh-CN', {minimumFractionDigits:2})}</td>
        <td>${statusTag}</td>
        <td>${pnlHtml}</td>
        <td>${pnlPctHtml}</td>
        <td>${holdDaysHtml}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-secondary" onclick="openReviewModal('${t.id}')">详情</button>
            ${closeBtn}
            <button class="btn btn-sm btn-secondary" onclick="editTrade('${t.id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTrade('${t.id}')">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 简单 HTML 转义，防止 XSS
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 搜索/过滤事件
document.getElementById('searchInput').addEventListener('input', renderRecords);
document.getElementById('filterStatus').addEventListener('change', renderRecords);
document.getElementById('filterAction').addEventListener('change', renderRecords);

// ==========================================
// 删除交易记录
// ==========================================

/**
 * 删除一条交易记录（需二次确认）
 * @param {string} id
 */
function deleteTrade(id) {
  showConfirm(
    '确认删除',
    '确定要删除这条交易记录吗？此操作不可撤销。',
    () => {
      const trades = loadTrades().filter(t => t.id !== id);
      saveTrades(trades);
      renderRecords();
      renderStats();
      showToast('记录已删除');
    }
  );
}

// ==========================================
// 编辑交易记录
// ==========================================

/**
 * 进入编辑模式
 * @param {string} id
 */
function editTrade(id) {
  const trade = loadTrades().find(t => t.id === id);
  if (!trade) return;
  enterEditMode(trade);
}

// ==========================================
// 平仓逻辑
// ==========================================

let closingId = null; // 当前正在平仓的记录 ID

/**
 * 打开平仓模态框
 * @param {string} id
 */
function openCloseModal(id) {
  const trade = loadTrades().find(t => t.id === id);
  if (!trade) return;
  closingId = id;

  // 填充买入信息摘要
  const grid = document.getElementById('closeInfoGrid');
  grid.innerHTML = `
    <div class="close-info-item">买入日期<span>${trade.date}</span></div>
    <div class="close-info-item">标的<span>${escHtml(trade.symbol)}</span></div>
    <div class="close-info-item">买入价<span>${trade.price.toFixed(3)}</span></div>
    <div class="close-info-item">数量<span>${trade.qty.toLocaleString()} 股</span></div>
    <div class="close-info-item">买入金额<span>${(trade.price * trade.qty).toLocaleString('zh-CN', {minimumFractionDigits:2})} 元</span></div>
    <div class="close-info-item">已持仓<span>${daysBetween(trade.date, new Date().toISOString().slice(0, 10))} 天</span></div>
  `;

  // 设置默认卖出日期为今天
  document.getElementById('c-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('c-price').value = '';
  document.getElementById('c-review').value = trade.review || '';

  openModal('closeModal');
}

// 确认平仓按钮
document.getElementById('confirmCloseBtn').addEventListener('click', () => {
  const closeDate = document.getElementById('c-date').value;
  const closePrice = parseFloat(document.getElementById('c-price').value);
  const review = document.getElementById('c-review').value.trim();

  if (!closeDate) {
    showToast('请填写卖出日期', 'error');
    return;
  }
  if (isNaN(closePrice) || closePrice <= 0) {
    showToast('请填写有效的卖出价格', 'error');
    return;
  }

  const trades = loadTrades();
  const idx = trades.findIndex(t => t.id === closingId);
  if (idx === -1) return;

  const trade = trades[idx];

  // 计算盈亏
  const pnl = (closePrice - trade.price) * trade.qty;
  const pnlPct = ((closePrice - trade.price) / trade.price) * 100;
  const holdDays = daysBetween(trade.date, closeDate);

  trades[idx] = {
    ...trade,
    status: 'closed',
    closeDate,
    closePrice,
    pnl: parseFloat(pnl.toFixed(2)),
    pnlPct: parseFloat(pnlPct.toFixed(4)),
    holdDays,
    review,
  };

  saveTrades(trades);
  closeModal('closeModal');
  renderRecords();
  renderStats();

  const pnlText = pnl >= 0 ? `盈利 ${pnl.toFixed(2)} 元` : `亏损 ${Math.abs(pnl).toFixed(2)} 元`;
  showToast(`平仓成功！${pnlText}`, pnl >= 0 ? 'success' : 'info');
});

// ==========================================
// 复盘详情模态框
// ==========================================

let reviewingId = null;

/**
 * 打开复盘/详情模态框
 * @param {string} id
 */
function openReviewModal(id) {
  const trade = loadTrades().find(t => t.id === id);
  if (!trade) return;
  reviewingId = id;

  const body = document.getElementById('reviewModalBody');

  const pnlClass = trade.pnl !== null ? (trade.pnl >= 0 ? 'profit-text' : 'loss-text') : '';
  const pnlStr = trade.pnl !== null ? fmtMoney(trade.pnl) + ' 元' : '–';
  const pnlPctStr = trade.pnlPct !== null ? fmtPct(trade.pnlPct) : '–';

  body.innerHTML = `
    <div class="close-info-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="close-info-item">日期<span>${trade.date}</span></div>
      <div class="close-info-item">标的<span>${escHtml(trade.symbol)}</span></div>
      <div class="close-info-item">方向<span>${trade.action === 'buy' ? '买入' : '卖出'}</span></div>
      <div class="close-info-item">价格<span>${trade.price.toFixed(3)}</span></div>
      <div class="close-info-item">数量<span>${trade.qty.toLocaleString()} 股</span></div>
      <div class="close-info-item">状态<span>${trade.status === 'open' ? '持仓中' : '已平仓'}</span></div>
      ${trade.stoploss ? `<div class="close-info-item">止损位<span>${trade.stoploss}</span></div>` : ''}
      ${trade.target ? `<div class="close-info-item">目标位<span>${trade.target}</span></div>` : ''}
      ${trade.status === 'closed' ? `
        <div class="close-info-item">卖出日期<span>${trade.closeDate}</span></div>
        <div class="close-info-item">卖出价格<span>${trade.closePrice ? trade.closePrice.toFixed(3) : '–'}</span></div>
        <div class="close-info-item">持仓天数<span>${trade.holdDays} 天</span></div>
        <div class="close-info-item">盈亏<span class="${pnlClass}">${pnlStr}</span></div>
        <div class="close-info-item">盈亏%<span class="${pnlClass}">${pnlPctStr}</span></div>
      ` : ''}
    </div>

    ${trade.reason ? `
      <div class="review-section">
        <h4>💡 交易理由</h4>
        <div class="review-text">${escHtml(trade.reason)}</div>
      </div>
    ` : ''}

    ${trade.note ? `
      <div class="review-section">
        <h4>📌 备注</h4>
        <div class="review-text">${escHtml(trade.note)}</div>
      </div>
    ` : ''}

    ${trade.review ? `
      <div class="review-section">
        <h4>📝 复盘总结</h4>
        <div class="review-text">${escHtml(trade.review)}</div>
      </div>
    ` : '<div class="review-section"><p style="color:var(--text-muted);font-size:13px;">尚未填写复盘总结，点击「编辑复盘」填写。</p></div>'}
  `;

  openModal('reviewModal');
}

// 编辑复盘按钮
document.getElementById('editReviewBtn').addEventListener('click', () => {
  const trade = loadTrades().find(t => t.id === reviewingId);
  if (!trade) return;
  document.getElementById('er-review').value = trade.review || '';
  closeModal('reviewModal');
  openModal('editReviewModal');
});

// 保存复盘
document.getElementById('saveReviewBtn').addEventListener('click', () => {
  const review = document.getElementById('er-review').value.trim();
  const trades = loadTrades();
  const idx = trades.findIndex(t => t.id === reviewingId);
  if (idx === -1) return;
  trades[idx].review = review;
  saveTrades(trades);
  closeModal('editReviewModal');
  renderRecords();
  showToast('复盘总结已保存 ✓');
});

// ==========================================
// 通用确认对话框
// ==========================================

let confirmCallback = null;

/**
 * 显示确认对话框
 * @param {string} title
 * @param {string} message
 * @param {Function} onConfirm
 */
function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  openModal('confirmModal');
}

document.getElementById('confirmOkBtn').addEventListener('click', () => {
  closeModal('confirmModal');
  if (typeof confirmCallback === 'function') {
    confirmCallback();
    confirmCallback = null;
  }
});

// ==========================================
// 统计计算 & 渲染
// ==========================================

/**
 * 计算所有统计指标并渲染到仪表盘
 */
function renderStats() {
  const trades = loadTrades();
  const closed = trades.filter(t => t.status === 'closed' && t.pnl !== null);
  const open = trades.filter(t => t.status === 'open');

  const profits = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl < 0);

  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const avgProfit = profits.length ? profits.reduce((s, t) => s + t.pnl, 0) / profits.length : null;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : null;
  const maxProfit = profits.length ? Math.max(...profits.map(t => t.pnl)) : null;
  const maxLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : null;

  const winRate = closed.length ? (profits.length / closed.length) * 100 : null;
  const rr = avgProfit !== null && avgLoss !== null && avgLoss !== 0
    ? Math.abs(avgProfit / avgLoss)
    : null;

  // 连续盈亏计算
  let maxWinStreak = 0, maxLossStreak = 0;
  let curWin = 0, curLoss = 0;
  // 按平仓日期升序排列计算连续
  const sortedClosed = [...closed].sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));
  sortedClosed.forEach(t => {
    if (t.pnl > 0) {
      curWin++;
      curLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, curWin);
    } else if (t.pnl < 0) {
      curLoss++;
      curWin = 0;
      maxLossStreak = Math.max(maxLossStreak, curLoss);
    } else {
      curWin = 0;
      curLoss = 0;
    }
  });

  // 渲染到 DOM
  setText('stat-total', trades.length);
  setText('stat-closed', closed.length);
  setText('stat-open', open.length);

  const winRateEl = document.getElementById('stat-winrate');
  if (winRate !== null) {
    winRateEl.textContent = winRate.toFixed(1) + '%';
    winRateEl.className = 'stat-value ' + (winRate >= 50 ? 'profit' : 'loss');
  } else {
    winRateEl.textContent = '–';
    winRateEl.className = 'stat-value neutral';
  }

  const rrEl = document.getElementById('stat-rr');
  rrEl.textContent = rr !== null ? rr.toFixed(2) : '–';

  const pnlEl = document.getElementById('stat-total-pnl');
  if (closed.length) {
    pnlEl.textContent = fmtMoney(totalPnl);
    pnlEl.className = 'stat-value ' + (totalPnl >= 0 ? 'profit' : 'loss');
  } else {
    pnlEl.textContent = '–';
    pnlEl.className = 'stat-value neutral';
  }

  setText('stat-avg-profit', avgProfit !== null ? fmtMoney(avgProfit) : '–');
  setText('stat-avg-loss', avgLoss !== null ? fmtMoney(avgLoss) : '–');
  setText('stat-max-profit', maxProfit !== null ? fmtMoney(maxProfit) : '–');
  setText('stat-max-loss', maxLoss !== null ? fmtMoney(maxLoss) : '–');
  setText('stat-win-streak', maxWinStreak || '–');
  setText('stat-loss-streak', maxLossStreak || '–');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ==========================================
// 图表
// ==========================================

// 保存图表实例，用于销毁重绘
const chartInstances = {};

/**
 * 渲染/刷新所有图表
 */
function renderCharts() {
  const trades = loadTrades();
  const closed = trades.filter(t => t.status === 'closed' && t.pnl !== null)
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));

  renderEquityChart(closed);
  renderWinRateChart(closed);
  renderBySymbolChart(closed);
}

/**
 * 累计盈亏曲线（同时渲染仪表盘和图表分析页）
 */
function renderEquityChart(closed) {
  const labels = [];
  const data = [];
  let cumPnl = 0;

  closed.forEach(t => {
    cumPnl += t.pnl;
    labels.push(t.closeDate);
    data.push(parseFloat(cumPnl.toFixed(2)));
  });

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '累计盈亏（元）',
        data,
        borderColor: data.length && data[data.length - 1] >= 0 ? '#e84c4c' : '#26a65b',
        backgroundColor: 'rgba(74,144,226,0.05)',
        borderWidth: 2,
        pointRadius: data.length <= 30 ? 4 : 2,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `累计盈亏：${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)} 元`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#9095a8', maxTicksLimit: 10, maxRotation: 30 },
          grid: { color: '#2e3248' },
        },
        y: {
          ticks: { color: '#9095a8' },
          grid: { color: '#2e3248' },
        },
      },
    },
  };

  ['chartEquity', 'chartEquity2'].forEach(canvasId => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }
    if (closed.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    chartInstances[canvasId] = new Chart(canvas, JSON.parse(JSON.stringify(chartConfig)));
  });
}

/**
 * 胜率饼图
 */
function renderWinRateChart(closed) {
  const wins = closed.filter(t => t.pnl > 0).length;
  const losses = closed.filter(t => t.pnl < 0).length;
  const ties = closed.filter(t => t.pnl === 0).length;

  const chartConfig = {
    type: 'doughnut',
    data: {
      labels: ['盈利', '亏损', '平局'],
      datasets: [{
        data: [wins, losses, ties],
        backgroundColor: ['#e84c4c', '#26a65b', '#4a90e2'],
        borderColor: '#1e2130',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9095a8', padding: 12, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}：${ctx.parsed} 笔 (${pct}%)`;
            },
          },
        },
      },
    },
  };

  ['chartWinRate', 'chartWinRate2'].forEach(canvasId => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }
    if (closed.length === 0) return;
    chartInstances[canvasId] = new Chart(canvas, JSON.parse(JSON.stringify(chartConfig)));
  });
}

/**
 * 各标的盈亏柱状图
 */
function renderBySymbolChart(closed) {
  // 按标的汇总盈亏
  const symbolMap = {};
  closed.forEach(t => {
    symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + t.pnl;
  });

  const symbols = Object.keys(symbolMap);
  const values = symbols.map(s => parseFloat(symbolMap[s].toFixed(2)));
  const colors = values.map(v => v >= 0 ? '#e84c4c' : '#26a65b');

  const chartConfig = {
    type: 'bar',
    data: {
      labels: symbols,
      datasets: [{
        label: '总盈亏（元）',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `总盈亏：${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)} 元`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#9095a8', maxRotation: 30 },
          grid: { color: '#2e3248' },
        },
        y: {
          ticks: { color: '#9095a8' },
          grid: { color: '#2e3248' },
        },
      },
    },
  };

  ['chartBySymbol', 'chartBySymbol2'].forEach(canvasId => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }
    if (closed.length === 0) return;
    chartInstances[canvasId] = new Chart(canvas, JSON.parse(JSON.stringify(chartConfig)));
  });
}

// ==========================================
// 数据管理：导出 / 导入 / 清空
// ==========================================

/**
 * 导出所有交易数据为 JSON 文件
 */
document.getElementById('exportBtn').addEventListener('click', () => {
  const trades = loadTrades();
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paper-trades-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${trades.length} 条记录`);
});

/**
 * 导入 JSON 文件（合并到现有数据）
 */
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      let incoming = [];
      if (Array.isArray(parsed)) {
        incoming = parsed;
      } else if (parsed.trades && Array.isArray(parsed.trades)) {
        incoming = parsed.trades;
      } else {
        showToast('文件格式不正确', 'error');
        return;
      }

      const existing = loadTrades();
      const existingIds = new Set(existing.map(t => t.id));
      const newOnes = incoming.filter(t => t.id && !existingIds.has(t.id));
      const merged = [...existing, ...newOnes];
      saveTrades(merged);
      renderRecords();
      renderStats();
      renderStorageInfo();
      showToast(`导入成功，新增 ${newOnes.length} 条记录`);
    } catch (err) {
      showToast('解析文件失败：' + err.message, 'error');
    }
    // 重置文件输入，允许重复选同一文件
    e.target.value = '';
  };
  reader.readAsText(file);
});

/**
 * 清空所有数据（需二次确认）
 */
document.getElementById('clearAllBtn').addEventListener('click', () => {
  showConfirm(
    '⚠️ 清空所有数据',
    '确定要删除所有交易记录吗？此操作不可撤销！建议先导出备份！',
    () => {
      localStorage.removeItem(STORAGE_KEY);
      renderRecords();
      renderStats();
      renderCharts();
      renderStorageInfo();
      showToast('所有数据已清空', 'info');
    }
  );
});

/**
 * 渲染存储信息
 */
function renderStorageInfo() {
  const trades = loadTrades();
  const raw = localStorage.getItem(STORAGE_KEY) || '';
  const sizeKb = (new Blob([raw]).size / 1024).toFixed(1);
  document.getElementById('storageInfo').textContent =
    `当前共有 ${trades.length} 条记录，占用约 ${sizeKb} KB 存储空间。数据存储在浏览器 localStorage 中，清除浏览器数据会导致记录丢失，请定期导出备份。`;
}

// ==========================================
// 初始化
// ==========================================

function init() {
  renderRecords();
  renderStats();
  renderCharts();
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', init);
