const express = require('express');
const path = require('path');
const axios = require('axios');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ============== 金属基础配置 ==============
const metals = {
  XAU: { name: '黄金', symbol: 'XAU', unit: '克', basePrice: 74.91 },
  XAG: { name: '白银', symbol: 'XAG', unit: '克', basePrice: 0.95 },
  XPT: { name: '铂金', symbol: 'XPT', unit: '克', basePrice: 30.86 },
  XPD: { name: '钯金', symbol: 'XPD', unit: '克', basePrice: 31.51 },
};

// ============== 新浪财经 - 实时价格（国内稳定可用） ==============
// hf_GC = 黄金(伦敦金), hf_SI = 白银(伦敦银)
const sinaCodes = { XAU: 'hf_GC', XAG: 'hf_SI' };

function parseSinaResponse(data, symbol) {
  const code = sinaCodes[symbol];
  if (!code) return null;
  const regex = new RegExp(`var hq_str_${code}="(.*?)";`);
  const match = data.match(regex);
  if (!match || !match[1] || match[1].trim() === '') return null;

  const fields = match[1].split(',');
  if (fields.length < 6) return null;

  const price = parseFloat(fields[0]);
  const prevClose = fields[1] ? parseFloat(fields[1]) : 0;
  const openPrice = parseFloat(fields[2]);
  const lowPrice = parseFloat(fields[3]);
  const highPrice = parseFloat(fields[4]);
  const updateTime = fields[5];
  const pricePerGram = price / 31.1035;

  return {
    price: parseFloat(pricePerGram.toFixed(2)),
    change: prevClose > 0 ? parseFloat(((price - prevClose) / 31.1035).toFixed(2)) : null,
    changePercent: prevClose > 0 ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)) : null,
    high: parseFloat((highPrice / 31.1035).toFixed(2)),
    low: parseFloat((lowPrice / 31.1035).toFixed(2)),
    open: parseFloat((openPrice / 31.1035).toFixed(2)),
    timestamp: new Date().toISOString(),
    updateTime: updateTime,
    source: 'Sina Finance',
  };
}

function fetchFromSinaFinance(symbols) {
  const codes = symbols.filter(s => sinaCodes[s]).map(s => sinaCodes[s]);
  if (codes.length === 0) return Promise.resolve({});

  const url = `http://hq.sinajs.cn/list=${codes.join(',')}`;
  return new Promise((resolve) => {
    http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({});
        const prices = {};
        for (const symbol of symbols) {
          const parsed = parseSinaResponse(data, symbol);
          if (parsed) prices[symbol] = parsed;
        }
        resolve(prices);
      });
    }).on('error', () => resolve({})).setTimeout(5000, () => { resolve({}); });
  });
}

// ============== 东方财富 - 历史K线数据 ==============
// 黄金ETF: 518880 (华安黄金ETF), 白银基金: 161226 (国投白银LOF)
const eastMoneyCodes = {
  XAU: { secid: '1.518880', name: '黄金ETF华安' },
  XAG: { secid: '0.161226', name: '国投白银LOF' },
};

async function fetchHistoryFromEastMoney(metal, days) {
  const emCode = eastMoneyCodes[metal];
  if (!emCode) return null;

  try {
    const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${emCode.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&end=20500101&lmt=${days}`;
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const klines = resp.data?.data?.klines;
    if (!klines || klines.length === 0) return null;

    const history = [];
    for (const line of klines) {
      const parts = line.split(',');
      if (parts.length >= 5) {
        history.push({
          date: parts[0],
          open: parseFloat(parts[1]),
          close: parseFloat(parts[2]),
          high: parseFloat(parts[3]),
          low: parseFloat(parts[4]),
        });
      }
    }

    return history.length > 0 ? history : null;
  } catch (e) {
    console.warn(`东方财富K线获取失败 (${metal}): ${e.message}`);
    return null;
  }
}

// 将ETF价格归一化到国际金价水平
function normalizeHistory(etaHistory, currentSpotPrice) {
  if (!etaHistory || etaHistory.length === 0) return null;

  // 取ETF最新收盘价，计算归一化比率
  const latestEtfClose = etaHistory[etaHistory.length - 1].close;
  if (!latestEtfClose || latestEtfClose === 0) return null;

  const ratio = currentSpotPrice / latestEtfClose;

  return etaHistory.map(item => ({
    time: new Date(item.date).toISOString(),
    price: parseFloat((item.close * ratio).toFixed(2)),
  }));
}

// ============== 获取外部数据 ==============
async function fetchFromExternalAPI() {
  const prices = await fetchFromSinaFinance(['XAU', 'XAG']);

  if (Object.keys(prices).length > 0) {
    console.log(`✅ 已获取 ${Object.keys(prices).length} 个金属数据（来源: Sina Finance）`);
  } else {
    console.warn('⚠️ Sina Finance 请求失败，无法获取实时数据');
  }

  return Object.keys(prices).length > 0 ? prices : null;
}

// ============== API 路由 ==============

app.get('/api/prices', async (req, res) => {
  try {
    const prices = await fetchFromExternalAPI();
    if (!prices) {
      return res.status(503).json({ success: false, error: '数据源不可用，请稍后再试', timestamp: new Date().toISOString() });
    }
    const result = {};
    for (const [symbol, metal] of Object.entries(metals)) {
      if (prices[symbol]) {
        result[symbol] = { ...prices[symbol], name: metal.name, symbol: metal.symbol, unit: metal.unit };
      }
    }
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: `获取数据失败: ${error.message}`, timestamp: new Date().toISOString() });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const metal = req.query.metal || 'XAU';
    const days = Math.min(parseInt(req.query.days) || 365, 1000);
    const metalInfo = metals[metal];
    if (!metalInfo) return res.status(400).json({ success: false, error: '不支持的金属类型' });

    // 先获取当前实时价格（用于归一化ETF数据）
    const spotPrices = await fetchFromSinaFinance([metal]);
    const currentPrice = spotPrices[metal]?.price;
    if (!currentPrice) {
      return res.status(503).json({ success: false, error: '无法获取当前价格，历史数据不可用', timestamp: new Date().toISOString() });
    }

    // 从东方财富获取ETF历史K线
    const etfHistory = await fetchHistoryFromEastMoney(metal, days);
    if (!etfHistory) {
      return res.status(503).json({ success: false, error: '历史数据源不可用', timestamp: new Date().toISOString() });
    }

    // 归一化：将ETF价格映射到国际金价水平
    const history = normalizeHistory(etfHistory, currentPrice);
    if (!history || history.length === 0) {
      return res.status(503).json({ success: false, error: '历史数据处理失败', timestamp: new Date().toISOString() });
    }

    console.log(`✅ 已获取 ${metalInfo.name} 历史数据 (${history.length} 条)`);
    res.json({ success: true, data: history, metal, name: metalInfo.name });
  } catch (error) {
    res.status(500).json({ success: false, error: `获取历史数据失败: ${error.message}`, timestamp: new Date().toISOString() });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  贵金属实时监控系统已启动');
  console.log(`  ➜ 本地地址: http://localhost:${PORT}`);
  console.log('  ➜ 实时价格: 新浪财经（黄金/白银）');
  console.log('  ➜ 历史数据: 东方财富ETF K线（归一化）');
  console.log('========================================');
});
