const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ============== 金属基础配置 ==============
const metals = {
  XAU: { name: '黄金', symbol: 'XAU', unit: '克', yahooSymbol: 'GC=F' },
  XAG: { name: '白银', symbol: 'XAG', unit: '克', yahooSymbol: 'SI=F' },
  XPT: { name: '铂金', symbol: 'XPT', unit: '克', yahooSymbol: 'PL=F' },
  XPD: { name: '钯金', symbol: 'XPD', unit: '克', yahooSymbol: 'PA=F' },
};

const OZ_TO_GRAM = 31.1035;

// ============== 全局统一数据源: gold-api.com ==============
// 免费公共API，无需注册，全球可访问，支持所有贵金属
async function fetchFromGoldAPI() {
  const symbols = ['XAU', 'XAG', 'XPT', 'XPD'];
  const prices = {};

  try {
    const results = await Promise.allSettled(
      symbols.map(symbol =>
        axios.get(`https://api.gold-api.com/price/${symbol}`, { timeout: 10000 })
      )
    );

    let anySuccess = false;
    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      const symbol = symbols[i];
      if (result.status === 'fulfilled' && result.value.data && result.value.data.price) {
        const d = result.value.data;
        // gold-api.com 返回 USD/盎司，转为 USD/克
        const pricePerGram = d.price / OZ_TO_GRAM;
        prices[symbol] = {
          price: parseFloat(pricePerGram.toFixed(2)),
          change: null, // gold-api.com 不提供涨跌额
          changePercent: null,
          high: null,
          low: null,
          timestamp: new Date().toISOString(),
          source: 'gold-api.com',
        };
        anySuccess = true;
      }
    }

    if (anySuccess) {
      console.log(`✅ gold-api.com: 已获取 ${Object.keys(prices).length} 个金属价格`);
      return prices;
    }
  } catch (e) {
    console.error('❌ gold-api.com 请求失败:', e.message);
  }

  return null;
}

// ============== Yahoo Finance 历史数据（服务端请求） ==============
async function fetchHistoryFromYahoo(yahooSymbol, days) {
  // Yahoo Finance v8 chart API — 从服务端请求，不受浏览器CORS限制
  const range = days <= 7 ? '7d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '1y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=1d`;

  try {
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    const result = resp.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp;
    const quotes = result.indicators?.quote?.[0];
    if (!timestamps || !quotes || !quotes.close) return null;

    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      const closePrice = quotes.close[i];
      if (closePrice && closePrice > 0) {
        // Yahoo 返回 USD/盎司，转为 USD/克
        const pricePerGram = closePrice / OZ_TO_GRAM;
        history.push({
          time: new Date(timestamps[i] * 1000).toISOString(),
          price: parseFloat(pricePerGram.toFixed(2)),
        });
      }
    }

    return history.length > 0 ? history : null;
  } catch (e) {
    console.warn(`⚠️ Yahoo Finance (${yahooSymbol}) 获取失败:`, e.message);
    return null;
  }
}

// ============== API: 实时价格 ==============
app.get('/api/prices', async (req, res) => {
  try {
    const prices = await fetchFromGoldAPI();

    if (!prices) {
      return res.status(503).json({
        success: false,
        error: '数据源 gold-api.com 不可用，请稍后重试',
        timestamp: new Date().toISOString(),
      });
    }

    const result = {};
    for (const [symbol, metal] of Object.entries(metals)) {
      if (prices[symbol]) {
        result[symbol] = {
          ...prices[symbol],
          name: metal.name,
          symbol: metal.symbol,
          unit: metal.unit,
        };
      }
    }

    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `获取数据失败: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============== API: 历史数据 ==============
app.get('/api/history', async (req, res) => {
  try {
    const metal = req.query.metal || 'XAU';
    const days = Math.min(parseInt(req.query.days) || 365, 1000);
    const metalInfo = metals[metal];

    if (!metalInfo) {
      return res.status(400).json({ success: false, error: '不支持的金属类型' });
    }

    // 从 Yahoo Finance 获取历史K线数据
    const history = await fetchHistoryFromYahoo(metalInfo.yahooSymbol, days);

    if (!history) {
      return res.status(503).json({
        success: false,
        error: `Yahoo Finance 历史数据不可用 (${metalInfo.name})`,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`✅ 已获取 ${metalInfo.name} 历史K线 (${history.length} 条)`);
    res.json({ success: true, data: history, metal, name: metalInfo.name, source: 'Yahoo Finance' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `获取历史数据失败: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============== 前端页面 ==============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  贵金属实时监控系统已启动');
  console.log(`  ➜ 本地地址: http://localhost:${PORT}`);
  console.log('  ➜ 实时价格: gold-api.com (全球统一API)');
  console.log('  ➜ 历史数据: Yahoo Finance (服务端请求)');
  console.log('  ➜ 数据均为真实行情，无模拟数据');
  console.log('========================================');
});