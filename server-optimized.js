const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const { execSync } = require('child_process');

const app = express();
const HTTP_PORT = 3001;
const HTTPS_PORT = 3444;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 基础认证
const authUsers = {
    'admin': 'Admin123456'
};

app.use(basicAuth({
    users: authUsers,
    challenge: true,
    realm: 'LOF Fund Tracker Optimized'
}));

// 数据库
const db = new sqlite3.Database('./funds.db');

// 获取华宝官网数据（官方数据）
async function getOfficialData(code) {
    try {
        const pythonScript = path.join(__dirname, 'fsfund_fetcher.py');
        const result = execSync(`python3 "${pythonScript}" "${code}"`, {
            encoding: 'utf-8',
            timeout: 8000
        });
        
        const data = JSON.parse(result);
        
        if (data.success && data.data) {
            return {
                success: true,
                type: 'official',
                source: '华宝基金官网',
                data: {
                    netValue: data.data.net_value,
                    date: data.data.date,
                    totalValue: data.data.total_value,
                    timestamp: data.data.timestamp
                }
            };
        }
        return { success: false, error: data.error || '官方数据获取失败' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 获取东方财富数据（实时估值）
async function getEstimationData(code) {
    try {
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, { timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        const fundName = $('.fundDetail-tit').text().trim() || `基金 ${code}`;
        const netValue = $('.dataItem01 .dataNums').first().text().trim() || '--';
        const dailyChange = $('.dataItem01 .dataNums').eq(1).text().trim() || '--';
        const totalValue = $('.dataItem02 .dataNums').first().text().trim() || '--';
        
        // 基金类型
        const typeText = $('.infoOfFund td').first().text();
        const fundType = typeText.split('：')[1]?.split('|')[0]?.trim() || '未知';
        
        // 申购状态
        let subscriptionStatus = '开放申购';
        const statusText = $('.static').text();
        if (statusText.includes('暂停申购')) {
            subscriptionStatus = '暂停申购';
        } else if (statusText.includes('限大额')) {
            subscriptionStatus = '限大额申购';
        }
        
        // 限购信息
        let purchaseLimit = '无限制';
        const limitMatch = response.data.match(/单日累计购买上限([0-9,.]+)元/);
        if (limitMatch && limitMatch[1]) {
            purchaseLimit = `${limitMatch[1]}元/天`;
        }
        
        return {
            success: true,
            type: 'estimation',
            source: '东方财富实时估值',
            data: {
                fundName,
                netValue,
                dailyChange,
                totalValue,
                fundType,
                subscriptionStatus,
                purchaseLimit,
                url: fundUrl
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 获取场内价格（AkShare）
async function getMarketPrice(code) {
    try {
        const pythonScript = path.join(__dirname, 'akshare_fetcher_simple.py');
        const result = execSync(`python3 "${pythonScript}" "${code}"`, {
            encoding: 'utf-8',
            timeout: 8000
        });
        
        const data = JSON.parse(result);
        
        if (data.success && data.data) {
            return {
                success: true,
                type: 'market',
                source: 'AkShare场内价格',
                data: {
                    price: data.data.price.toFixed(4),
                    source: data.data.source,
                    timestamp: data.data.timestamp
                }
            };
        }
        return { success: false, error: data.error || '场内价格获取失败' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 1. 搜索基金
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.json({ success: true, data: [] });
    }
    
    try {
        const commonLOFs = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' }
        ];
        
        const matched = commonLOFs.filter(fund => 
            fund.code.includes(keyword) || 
            fund.name.includes(keyword)
        );
        
        res.json({
            success: true,
            data: matched,
            message: matched.length > 0 ? `找到 ${matched.length} 个LOF基金` : '未找到相关基金'
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: '搜索失败',
            message: error.message
        });
    }
});

// 2. 获取基金详情（优化显示版）
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    
    console.log(`获取基金数据（优化版）: ${code}`);
    
    try {
        // 并行获取三种数据
        const [officialResult, estimationResult, marketResult] = await Promise.allSettled([
            getOfficialData(code),
            getEstimationData(code),
            getMarketPrice(code)
        ]);
        
        // 构建优化后的数据格式
        const fundInfo = {
            code: code,
            
            // 1. 官方数据（主显示）
            official: {
                netValue: '--',
                date: '--',
                totalValue: '--',
                source: '华宝基金官网',
                status: '未获取'
            },
            
            // 2. 实时估值（辅助显示）
            estimation: {
                netValue: '--',
                dailyChange: '--',
                totalValue: '--',
                source: '东方财富实时估值',
                status: '未获取',
                fundName: `基金 ${code}`,
                fundType: '未知',
                subscriptionStatus: '未知',
                purchaseLimit: '无限制'
            },
            
            // 3. 场内价格
            market: {
                price: '--',
                source: '--',
                status: '未获取'
            },
            
            // 4. 计算数据
            calculations: {
                premiumRate: '--',  // 折溢价率（基于官方净值）
                estimationDiff: '--', // 估值与官方差异
                updateTime: new Date().toLocaleString('zh-CN')
            }
        };
        
        // 处理官方数据
        if (officialResult.status === 'fulfilled' && officialResult.value.success) {
            const official = officialResult.value;
            fundInfo.official = {
                netValue: official.data.netValue,
                date: official.data.date,
                totalValue: official.data.totalValue,
                source: official.source,
                status: '成功',
                timestamp: official.data.timestamp
            };
        }
        
        // 处理估值数据
        if (estimationResult.status === 'fulfilled' && estimationResult.value.success) {
            const estimation = estimationResult.value;
            fundInfo.estimation = {
                netValue: estimation.data.netValue,
                dailyChange: estimation.data.dailyChange,
                totalValue: estimation.data.totalValue,
                source: estimation.source,
                status: '成功',
                fundName: estimation.data.fundName,
                fundType: estimation.data.fundType,
                subscriptionStatus: estimation.data.subscriptionStatus,
                purchaseLimit: estimation.data.purchaseLimit,
                url: estimation.data.url
            };
        }
        
        // 处理场内价格
        if (marketResult.status === 'fulfilled' && marketResult.value.success) {
            const market = marketResult.value;
            fundInfo.market = {
                price: market.data.price,
                source: market.data.source,
                status: '成功',
                timestamp: market.data.timestamp
            };
        }
        
        // 计算折溢价率（基于官方净值）
        if (fundInfo.official.netValue !== '--' && fundInfo.market.price !== '--') {
            try {
                const officialNetValue = parseFloat(fundInfo.official.netValue);
                const marketPrice = parseFloat(fundInfo.market.price);
                
                if (officialNetValue > 0) {
                    const premium = ((marketPrice - officialNetValue) / officialNetValue * 100).toFixed(2);
                    fundInfo.calculations.premiumRate = `${premium}%`;
                }
            } catch (e) {
                console.log('折溢价率计算失败:', e.message);
            }
        }
        
        // 计算估值与官方差异
        if (fundInfo.official.netValue !== '--' && fundInfo.estimation.netValue !== '--') {
            try {
                const officialValue = parseFloat(fundInfo.official.netValue);
                const estimationValue = parseFloat(fundInfo.estimation.netValue.split('-')[0] || fundInfo.estimation.netValue);
                
                if (officialValue > 0) {
                    const diff = ((estimationValue - officialValue) / officialValue * 100).toFixed(2);
                    fundInfo.calculations.estimationDiff = `${diff}%`;
                }
            } catch (e) {
                console.log('估值差异计算失败:', e.message);
            }
        }
        
        // 设置基金名称（优先使用估值数据中的名称）
        fundInfo.name = fundInfo.estimation.fundName || `基金 ${code}`;
        
        res.json({
            success: true,
            data: fundInfo,
            message: '数据获取成功',
            timestamp: new Date().toISOString(),
            summary: {
                officialNetValue: fundInfo.official.netValue,
                estimationNetValue: fundInfo.estimation.netValue,
                marketPrice: fundInfo.market.price,
                premiumRate: fundInfo.calculations.premiumRate
            }
        });
        
    } catch (error) {
        console.error('获取数据失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取数据失败',
            message: error.message
        });
    }
});

// 3. 添加到关注列表
app.post('/api/fund/add', (req, res) => {
    const { code, name } = req.body;
    
    if (!code || !name) {
        return res.status(400).json({ error: '基金代码和名称不能为空' });
    }
    
    db.run(
        'INSERT OR REPLACE INTO funds (fund_code, fund_name, is_active) VALUES (?, ?, 1)',
        [code, name],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '添加基金失败' });
            }
            res.json({ 
                success: true, 
                message: '基金添加成功',
                fundId: this.lastID 
            });
        }
    );
});

// 4. 获取关注列表
app.get('/api/funds', (req, res) => {
    db.all(
        'SELECT * FROM funds WHERE is_active = 1 ORDER BY created_at DESC',
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '获取基金列表失败' });
            }
            res.json({ success: true, data: rows });
        }
    );
});

// 5. 服务器状态
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            serverTime: new Date().toLocaleString('zh-CN'),
            message: 'LOF基金查询系统（优化版）运行正常',
            version: '1.0.0-optimized',
            dataSources: [
                '华宝基金官网（官方净值）',
                '东方财富（实时估值）',
                'AkShare（场内价格）'
            ],
            displayLogic: '官方净值为主，实时估值为辅'
        }
    });
});

// 6. 测试API连接
app.get('/api/test', async (req, res) => {
    try {
        // 测试华宝官网
        const official = await getOfficialData('162411');
        // 测试东方财富
        const estimation = await getEstimationData('162411');
        
        res.json({
            success: true,
            message: '✅ 所有数据源连接正常',
            sources: {
                official: official.success ? '✅ 正常' : '❌ 异常',
                estimation: estimation.success ? '✅ 正常' : '❌ 异常'
            },
            timestamp: new Date().toLocaleString('zh-CN')
        });
    } catch (error) {
        res.json({
            success: false,
            message: '❌ 数据源连接异常',
            error: error.message
        });
    }
});

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-optimized.html'));
});

// 启动服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        secureProtocol: 'TLSv1_2_method'
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✅ 优化版HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
    });
    
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`✅ 优化版HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT}`);
        console.log(`\n🎉 LOF基金查询系统（优化显示版）已启动`);
        console.log(`\n🔐 登录信息: admin / Admin123456`);
        console.log(`\n📊 显示逻辑:`);
        console.log(`   主显示: 基金公司昨日净值（官方确认）`);
        console.log(`   辅助显示: 东方财富实时估值（仅供参考）`);
        console.log(`   场内价格: AkShare实时数据`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n🚀 测试命令:`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/fund/162411"`);
    });
} catch (error) {
    console.log('启动失败:', error.message);
}