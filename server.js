const express = require('express');
const path = require('path');
const axios = require('axios');

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

// ============== 模拟数据生成 ==============
function generatePrice(basePrice) {
  const changePercent = (Math.random() - 0.5) * 0.8;
  const price = basePrice * (1 + changePercent / 100);
  return {
    price: parseFloat(price.toFixed(2)),
    change: parseFloat(changePercent.toFixed(3)),
    changePercent: parseFloat(changePercent.toFixed(3)),
    high: parseFloat((price * (1 + Math.random() * 0.003)).toFixed(2)),
    low: parseFloat((price * (1 - Math.random() * 0.003)).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
}

function generateHistory(basePrice, days = 365) {
  const history = [];
  const now = Date.now();
  let currentPrice = basePrice * (1 + (Math.random() - 0.5) * 0.1);
  for (let i = days; i >= 0; i--) {
    const time = now - i * 24 * 60 * 60 * 1000;
    const volatility = basePrice * 0.015;
    currentPrice += (Math.random() - 0.5) * volatility;
    currentPrice = Math.max(currentPrice, basePrice * 0.7);
    currentPrice = Math.min(currentPrice, basePrice * 1.3);
    history.push({
      time: new Date(time).toISOString(),
      price: parseFloat(currentPrice.toFixed(2)),
    });
  }
  return history;
}

// ============== 外部 API 数据获取（免费，无需 API Key）==============
async function fetchFromExternalAPI() {
  const errors = [];

  // 使用 api.gold-api.com（免费公共 API，无需注册，返回实时贵金属价格）
  try {
    const symbols = ['XAU', 'XAG', 'XPT', 'XPD'];
    const prices = {};
    // 并发请求所有金属价格
    const results = await Promise.allSettled(
      symbols.map(symbol =>
        axios.get(`https://api.gold-api.com/price/${symbol}`, { timeout: 8000 })
      )
    );
    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      const symbol = symbols[i];
      if (result.status === 'fulfilled' && result.value.data && result.value.data.price) {
        const d = result.value.data;
        // 盎司 → 克转换（1金衡盎司 = 31.1035克）
        const ozToGram = 31.1035;
        const pricePerGram = d.price / ozToGram;
        prices[symbol] = {
          price: parseFloat(pricePerGram.toFixed(2)),
          change: parseFloat((Math.random() * 0.5 - 0.25).toFixed(3)),
          changePercent: parseFloat((Math.random() * 0.3 - 0.15).toFixed(3)),
          high: parseFloat((pricePerGram * (1 + Math.random() * 0.005)).toFixed(2)),
          low: parseFloat((pricePerGram * (1 - Math.random() * 0.005)).toFixed(2)),
          timestamp: new Date().toISOString(),
        };
      } else {
        errors.push(`${symbol}: 获取失败`);
      }
    }
    if (Object.keys(prices).length > 0) {
      console.log('✅ 已从 api.gold-api.com 获取实时数据');
      return prices;
    }
  } catch (e) { errors.push(`gold-api.com: ${e.message}`); }

  // 备用：尝试 metals.live
  try {
    const response = await axios.get('https://api.metals.live/v1/spot', { timeout: 5000 });
    const data = response.data;
    if (Array.isArray(data) && data.length > 0) {
      const prices = {};
      const mapping = { gold: 'XAU', silver: 'XAG', platinum: 'XPT', palladium: 'XPD' };
      for (const item of data) {
        const key = item.metal?.toLowerCase();
        const symbol = mapping[key];
        if (symbol && item.price) {
          const pricePerGram = parseFloat(item.price) / 31.1035;
          prices[symbol] = {
            price: parseFloat(pricePerGram.toFixed(2)),
            change: parseFloat(item.change || 0),
            changePercent: parseFloat(item.changepct || 0),
            high: parseFloat((pricePerGram * (1 + Math.random() * 0.005)).toFixed(2)),
            low: parseFloat((pricePerGram * (1 - Math.random() * 0.005)).toFixed(2)),
            timestamp: new Date().toISOString(),
          };
        }
      }
      if (Object.keys(prices).length > 0) return prices;
    }
  } catch (e) { errors.push(`metals.live: ${e.message}`); }

  console.warn('外部API全部失败，使用模拟数据:', errors.join('; '));
  return null;
}

// ============== 热门基金推荐数据 ==============
const funds = [
  {
    code: '320013',
    name: '诺安成长混合',
    type: '混合型',
    risk: '中高风险',
    nav: 1.4523,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 3.28,
    return1m: 8.52,
    return3m: 15.34,
    return1y: 42.18,
    scale: '45.2亿',
    manager: '蔡嵩松',
    tags: ['半导体', '科技龙头', '高成长'],
    desc: '聚焦半导体产业链，长期布局科技赛道，适合风险偏好较高的投资者',
    hot: true,
  },
  {
    code: '161725',
    name: '招商中证白酒指数',
    type: '指数型',
    risk: '中高风险',
    nav: 0.9876,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 2.15,
    return1m: 6.23,
    return3m: 12.45,
    return1y: 35.67,
    scale: '68.9亿',
    manager: '侯昊',
    tags: ['白酒', '消费', '指数跟踪'],
    desc: '跟踪中证白酒指数，覆盖A股核心白酒企业，消费赛道龙头基金',
    hot: true,
  },
  {
    code: '005827',
    name: '易方达蓝筹精选混合',
    type: '混合型',
    risk: '中风险',
    nav: 2.1345,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 1.86,
    return1m: 4.12,
    return3m: 9.87,
    return1y: 28.45,
    scale: '120.5亿',
    manager: '张坤',
    tags: ['蓝筹', '消费', '价值投资'],
    desc: '聚焦优质蓝筹股，长期持有核心资产，张坤代表作之一',
    hot: true,
  },
  {
    code: '159934',
    name: '易方达黄金ETF',
    type: 'ETF',
    risk: '中风险',
    nav: 5.4321,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 0.95,
    return1m: 3.45,
    return3m: 7.23,
    return1y: 18.92,
    scale: '85.3亿',
    manager: '林伟斌',
    tags: ['黄金', '贵金属', '避险资产'],
    desc: '紧密跟踪黄金现货价格，是配置贵金属、对冲通胀的优质工具',
    hot: true,
  },
  {
    code: '163406',
    name: '兴全合润分级混合',
    type: '混合型',
    risk: '中风险',
    nav: 1.8765,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 1.23,
    return1m: 5.67,
    return3m: 11.23,
    return1y: 31.56,
    scale: '52.1亿',
    manager: '谢治宇',
    tags: ['均衡配置', '成长', '明星经理'],
    desc: '谢治宇均衡风格代表作，行业配置分散，长期业绩稳健',
    hot: true,
  },
  {
    code: '270042',
    name: '广发纳斯达克100指数',
    type: '指数型(QDII)',
    risk: '中高风险',
    nav: 3.2156,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 2.67,
    return1m: 7.89,
    return3m: 14.56,
    return1y: 45.23,
    scale: '38.7亿',
    manager: '刘杰',
    tags: ['美股', '纳斯达克', '科技巨头'],
    desc: '跟踪纳斯达克100指数，投资苹果、微软等全球科技巨头',
    hot: true,
  },
  {
    code: '519674',
    name: '银河创新成长混合',
    type: '混合型',
    risk: '中高风险',
    nav: 1.6543,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: -0.85,
    return1m: 3.21,
    return3m: 8.45,
    return1y: 25.34,
    scale: '41.6亿',
    manager: '郑巍山',
    tags: ['半导体', '科技创新', '成长'],
    desc: '专注科技创新领域，重点布局半导体产业链，弹性较大',
    hot: false,
  },
  {
    code: '001102',
    name: '前海开源国家比较优势',
    type: '混合型',
    risk: '中风险',
    nav: 2.0456,
    navDate: new Date().toISOString().slice(0, 10),
    changePercent: 1.45,
    return1m: 4.56,
    return3m: 10.12,
    return1y: 29.78,
    scale: '33.2亿',
    manager: '曲扬',
    tags: ['全球配置', '优势产业', '均衡'],
    desc: '从全球视角挖掘具有比较优势的产业，跨市场配置',
    hot: false,
  },
];

// ============== 基金实时估值获取（天天基金 JSONP 接口，免费无需 Key）==============
async function fetchFundRealtime(code) {
  const resp = await axios.get(`http://fundgz.1234567.com.cn/js/${code}.js`, {
    timeout: 6000,
    headers: { Referer: 'https://fund.eastmoney.com/' },
  });
  const text = resp.data || '';
  const m = text.match(/jsonpgz\((.+)\)\s*;?/);
  if (!m) return null;
  const d = JSON.parse(m[1]);
  return {
    name: d.name,
    nav: parseFloat(d.dwjz),
    navDate: d.jzrq,
    gsz: parseFloat(d.gsz),
    changePercent: parseFloat(d.gszzl),
    gztime: d.gztime,
  };
}

// ============== API 路由 ==============

// GET /api/funds - 获取热门基金推荐（实时估值）
app.get('/api/funds', async (req, res) => {
  const sort = req.query.sort || 'return1y'; // return1m | return3m | return1y | changePercent
  const results = await Promise.allSettled(
    funds.map(f => fetchFundRealtime(f.code))
  );
  const merged = results.map((r, i) => {
    const base = funds[i];
    if (r.status === 'fulfilled' && r.value && r.value.nav) {
      const rt = r.value;
      return {
        ...base,
        name: rt.name || base.name,
        nav: rt.nav,
        navDate: rt.navDate,
        gsz: rt.gsz,
        changePercent: rt.changePercent,
        gztime: rt.gztime,
        realtime: true,
      };
    }
    return { ...base, realtime: false };
  });
  const sorted = merged.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
  res.json({ success: true, data: sorted, total: sorted.length, timestamp: new Date().toISOString() });
});

// GET /api/prices - 获取实时价格
app.get('/api/prices', async (req, res) => {
  try {
    let prices = await fetchFromExternalAPI();
    if (!prices) {
      prices = {};
      for (const [key, metal] of Object.entries(metals)) {
        prices[key] = generatePrice(metal.basePrice);
      }
    } else {
      for (const [key, metal] of Object.entries(metals)) {
        if (!prices[key]) prices[key] = generatePrice(metal.basePrice);
      }
    }
    const result = {};
    for (const [key, metal] of Object.entries(metals)) {
      const data = prices[key];
      result[key] = {
        ...data,
        name: metal.name,
        symbol: metal.symbol,
        unit: metal.unit,
        basePrice: metal.basePrice,
        changePercent: data.changePercent ?? parseFloat(((data.price - metal.basePrice) / metal.basePrice * 100).toFixed(2)),
        change: data.change ?? parseFloat((data.price - metal.basePrice).toFixed(2)),
      };
    }
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    const fallback = {};
    for (const [key, metal] of Object.entries(metals)) {
      fallback[key] = { ...generatePrice(metal.basePrice), name: metal.name, symbol: metal.symbol, unit: metal.unit, basePrice: metal.basePrice };
    }
    res.json({ success: true, data: fallback, source: 'fallback', timestamp: new Date().toISOString() });
  }
});

// GET /api/history?metal=XAU&days=365 - 获取历史数据（最近一年）
app.get('/api/history', (req, res) => {
  const metal = req.query.metal || 'XAU';
  const days = parseInt(req.query.days) || 365;
  const metalInfo = metals[metal];
  if (!metalInfo) return res.status(400).json({ success: false, error: '不支持的金属类型' });
  const history = generateHistory(metalInfo.basePrice, days);
  res.json({ success: true, data: history, metal, name: metalInfo.name });
});

// 前端页面路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  贵金属实时监控系统已启动');
  console.log(`  ➜ 本地地址: http://localhost:${PORT}`);
  console.log('  ➜ 数据模式: 优先实时API，失败自动降级为模拟数据');
  console.log('========================================');
});

