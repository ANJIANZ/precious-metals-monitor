// ============== 全局状态 ==============
const state = {
  prices: {},
  chart: null,
  chartData: [],
  refreshInterval: 1,
  timerId: null,
  metalColors: { XAU: '#f0b90b', XAG: '#c0c0c0', XPT: '#a8b8c8', XPD: '#b8a8c8' },
  metalIcons: { XAU: '🥇', XAG: '🥈', XPT: '🔘', XPD: '💎' },
  cnyRate: 6.80, // 默认汇率，启动时会获取实时汇率
};

const $ = (id) => document.getElementById(id);
const clockEl = $('clock');
const statusText = $('statusText');
const statusDot = $('statusDot');
const priceCards = $('priceCards');
const tableBody = $('tableBody');
const metalSelect = $('metalSelect');
const rangeSelect = $('rangeSelect');
const refreshDisplay = $('refreshIntervalDisplay');
const errorBanner = $('errorBanner');

function setError(msg) {
  if (!errorBanner) return;
  if (msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  } else {
    errorBanner.style.display = 'none';
  }
}

// ============== 工具函数 ==============
function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

function setStatus(ok) {
  statusText.textContent = ok ? '实时' : '已断开';
  statusDot.className = 'status-dot' + (ok ? '' : ' disconnected');
}

function fmtPrice(v, d = 2) {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtTime(s) {
  return new Date(s).toLocaleTimeString('zh-CN', { hour12: false });
}

// ============== 渲染价格卡片 ==============
function renderCards(data) {
  let html = '';
  for (const [key, m] of Object.entries(data)) {
    const changePct = m.changePercent ?? 0;
    const changeVal = m.change ?? 0;
    const up = changeVal >= 0;
    const arrow = up ? '▲' : '▼';
    const sign = up ? '+' : '';
    const highStr = m.high ? fmtPrice(m.high) : '--';
    const lowStr = m.low ? fmtPrice(m.low) : '--';
    html += `<div class="price-card" data-metal="${key}">
      <div class="metal-icon">${state.metalIcons[key] || '🏅'}</div>
      <div class="metal-name">${m.name}</div>
      <div class="metal-symbol">${m.symbol}/${m.unit}</div>
      <div class="current-price">$${fmtPrice(m.price)}</div>
      <div class="cny-price">≈ ¥${fmtPrice(m.price * state.cnyRate)}</div>
      <div class="price-change ${up ? 'up' : 'down'}">${arrow} ${sign}${changePct.toFixed(2)}%</div>
      <div class="card-details">
        <span><span class="label">最高</span>$${highStr}</span>
        <span><span class="label">最低</span>$${lowStr}</span>
        <span><span class="label">更新</span>${fmtTime(m.timestamp)}</span>
      </div>
    </div>`;
  }
  priceCards.innerHTML = html;
}

// ============== 渲染数据表格 ==============
function renderTable(data) {
  let html = '';
  for (const [key, m] of Object.entries(data)) {
    const up = m.change >= 0;
    const cls = up ? 'price-up' : 'price-down';
    const arrow = up ? '▲' : '▼';
    const sign = up ? '+' : '';
    html += `<tr>
      <td><strong>${state.metalIcons[key] || ''} ${m.name}</strong> (${m.symbol})</td>
      <td class="${cls}">$${fmtPrice(m.price)}</td>
      <td class="${cls}">¥${fmtPrice(m.price * state.cnyRate)}</td>
      <td class="${cls}">${arrow} ${sign}${fmtPrice(m.change)}</td>
      <td class="${cls}">${sign}${(m.changePercent ?? 0).toFixed(2)}%</td>
      <td>$${fmtPrice(m.high)}</td>
      <td>$${fmtPrice(m.low)}</td>
      <td>${fmtTime(m.timestamp)}</td>
    </tr>`;
  }
  tableBody.innerHTML = html;
}

// ============== 图表管理 ==============
function initChart() {
  if (typeof Chart === 'undefined') { setTimeout(initChart, 500); return; }
  const ctx = $('priceChart').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: '价格 (CNY/克)', data: [],
      borderColor: '#f0b90b', backgroundColor: 'rgba(240,185,11,0.08)',
      borderWidth: 2, fill: true, tension: 0.3,
      pointRadius: 0, pointHitRadius: 10, pointHoverRadius: 5,
      pointHoverBackgroundColor: '#f0b90b', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2c38', titleColor: '#e8f0f8', bodyColor: '#f0b90b',
          borderColor: '#2a3a48', borderWidth: 1, padding: 12, displayColors: false,
          callbacks: {
            title: (items) => new Date(items[0].label).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }),
            label: (item) => '¥' + Number(item.raw * state.cnyRate).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' / 克',
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)', display: false }, ticks: { color: '#5a6a7a', maxTicksLimit: 12, font: { size: 11 }, maxRotation: 45 } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#5a6a7a', font: { size: 11 }, callback: (v) => '¥' + (v * state.cnyRate).toLocaleString() + '/克' } },
      },
    },
  });
}

function updateChart(data, metalKey) {
  if (!state.chart) return;
  const color = state.metalColors[metalKey] || '#f0b90b';
  state.chart.data.labels = data.map(d => d.time);
  state.chart.data.datasets[0].data = data.map(d => d.price);
  state.chart.data.datasets[0].borderColor = color;
  state.chart.data.datasets[0].backgroundColor = color + '18';
  state.chart.data.datasets[0].pointRadius = data.length <= 50 ? 1 : 0;
  state.chart.update('none');
}

async function loadHistory(metal, days) {
  try {
    const r = await fetch(`/api/history?metal=${metal}&days=${days}`);
    const j = await r.json();
    if (j.success) {
      state.chartData = j.data;
      updateChart(j.data, metal);
      setError('');
    } else {
      setError(`⚠️ ${j.error || '历史数据获取失败'}`);
    }
  } catch (e) {
    setError('⚠️ 加载历史数据失败');
  }
}

// ============== 汇率获取 ==============
async function fetchCNYRate() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const j = await r.json();
    if (j.rates && j.rates.CNY) {
      state.cnyRate = j.rates.CNY;
      console.log('当前人民币汇率: ¥', state.cnyRate);
    }
  } catch (e) {
    console.warn('获取汇率失败，使用默认值:', state.cnyRate);
  }
}

// ============== 价格获取 ==============
async function fetchPrices() {
  try {
    const r = await fetch('/api/prices');
    const j = await r.json();
    if (j.success) {
      state.prices = j.data;
      renderCards(j.data);
      renderTable(j.data);
      setStatus(true);
      setError('');
    } else {
      setError(`⚠️ ${j.error || '价格获取失败'}`);
      setStatus(false);
    }
  } catch (e) {
    setError('⚠️ 连接服务器失败，请检查服务是否运行');
    setStatus(false);
  }
}

// ============== 自动刷新 ==============
function startAutoRefresh(sec) {
  if (state.timerId) clearInterval(state.timerId);
  state.refreshInterval = sec;
  refreshDisplay.textContent = sec;
  state.timerId = setInterval(fetchPrices, sec * 1000);
}

// ============== 初始化 ==============
async function init() {
  await fetchCNYRate();
  initChart();
  await fetchPrices();
  await loadHistory(metalSelect.value, parseInt(rangeSelect.value));
  startAutoRefresh(5);

  metalSelect.addEventListener('change', () => loadHistory(metalSelect.value, parseInt(rangeSelect.value)));
  rangeSelect.addEventListener('change', () => loadHistory(metalSelect.value, parseInt(rangeSelect.value)));

  setInterval(() => loadHistory(metalSelect.value, parseInt(rangeSelect.value)), 5 * 60 * 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();