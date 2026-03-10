const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const basicAuth = require('express-basic-auth');

const app = express();
const HTTP_PORT = 3003;
const HTTPS_PORT = 3446;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 基础认证配置
const authUsers = {
    'admin': 'Admin123456'
};

// 应用基础认证到所有路由
app.use(basicAuth({
    users: authUsers,
    challenge: true,
    realm: 'LOF Fund Tracker'
}));

// 数据库初始化
const db = new sqlite3.Database('./funds.db');
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS funds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fund_code TEXT UNIQUE NOT NULL,
            fund_name TEXT NOT NULL,
            fund_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS fund_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fund_code TEXT NOT NULL,
            market_price REAL,
            net_value REAL,
            premium_rate REAL,
            subscription_status TEXT,
            update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fund_code) REFERENCES funds(fund_code)
        )
    `);
});

// 数据源配置
const DATA_SOURCES = {
    eastmoney: {
        baseUrl: 'https://fund.eastmoney.com',
        search: 'https://fundsuggest.eastmoney.com/FundSearchAPI.ashx'
    }
};

// 1. 搜索基金（真实API + 模拟备用）
app.get('/api/search', async (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ error: '请输入搜索关键词' });
        }

        console.log(`搜索基金: ${keyword}`);
        
        // 尝试使用真实API
        try {
            const response = await axios.get(DATA_SOURCES.eastmoney.search, {
                params: {
                    m: 1,
                    key: keyword,
                    _: Date.now()
                },
                timeout: 10000
            });

            if (response.data && response.data.Datas) {
                const funds = response.data.Datas.map(fund => ({
                    code: fund.CODE,
                    name: fund.NAME,
                    type: fund.FTYPE || '',
                    pinyin: fund.PINYIN
                })).filter(fund => 
                    (fund.type && fund.type.includes('LOF')) || 
                    (fund.name && fund.name.includes('LOF')) ||
                    (fund.code && fund.code === keyword)
                );
                
                if (funds.length > 0) {
                    console.log(`找到 ${funds.length} 个基金`);
                    return res.json({ success: true, data: funds, source: 'real' });
                }
            }
        } catch (apiError) {
            console.log('API搜索失败，使用模拟数据:', apiError.message);
        }
        
        // 如果API失败，使用模拟数据
        const mockFunds = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' },
            { code: '160416', name: '华安石油(LOF)', type: 'LOF' },
            { code: '160719', name: '嘉实黄金(LOF)', type: 'LOF' }
        ].filter(fund => 
            fund.code.includes(keyword) || 
            fund.name.includes(keyword) ||
            fund.code === keyword
        );
        
        res.json({ 
            success: true, 
            data: mockFunds, 
            source: 'mock',
            message: mockFunds.length > 0 ? '搜索成功' : '未找到相关基金'
        });
        
    } catch (error) {
        console.error('搜索基金失败:', error);
        res.status(500).json({ 
            error: '搜索基金失败',
            message: error.message 
        });
    }
});

// 2. 获取基金详情（真实数据 + 模拟备用）
app.get('/api/fund/:code', async (req, res) => {
    try {
        const { code } = req.params;
        console.log(`获取基金详情: ${code}`);
        
        // 尝试获取真实数据
        try {
            const fundUrl = `${DATA_SOURCES.eastmoney.baseUrl}/${code}.html`;
            const response = await axios.get(fundUrl, { timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            // 解析基金基本信息
            const fundInfo = {
                code: code,
                name: $('.fundDetail-tit').text().trim() || `基金 ${code}`,
                netValue: $('.dataItem01 .dataNums').first().text().trim() || '--',
                dailyChange: $('.dataItem01 .dataNums').eq(1).text().trim() || '--',
                marketPrice: $('.dataItem02 .dataNums').first().text().trim() || '--',
                premiumRate: $('.dataItem02 .dataNums').eq(1).text().trim() || '--',
                subscriptionStatus: '开放申购'
            };
            
            // 检查申购状态
            const statusText = $('.static').text();
            if (statusText.includes('暂停申购')) {
                fundInfo.subscriptionStatus = '暂停申购';
            } else if (statusText.includes('限制申购')) {
                fundInfo.subscriptionStatus = '限制申购';
            }
            
            // 保存到数据库
            db.run(
                'INSERT OR IGNORE INTO funds (fund_code, fund_name) VALUES (?, ?)',
                [code, fundInfo.name]
            );
            
            db.run(
                'INSERT INTO fund_prices (fund_code, market_price, net_value, premium_rate, subscription_status) VALUES (?, ?, ?, ?, ?)',
                [code, fundInfo.marketPrice, fundInfo.netValue, fundInfo.premiumRate, fundInfo.subscriptionStatus]
            );
            
            return res.json({ 
                success: true, 
                data: fundInfo,
                source: 'real'
            });
        } catch (apiError) {
            console.log('API获取详情失败，使用模拟数据:', apiError.message);
        }
        
        // 模拟数据
        const mockInfo = {
            code: code,
            name: `模拟基金 ${code}`,
            netValue: (Math.random() * 2 + 1).toFixed(4),
            dailyChange: (Math.random() * 0.1 - 0.05).toFixed(2) + '%',
            marketPrice: (Math.random() * 2 + 1).toFixed(4),
            premiumRate: (Math.random() * 0.2 - 0.1).toFixed(2) + '%',
            subscriptionStatus: Math.random() > 0.3 ? '开放申购' : '暂停申购'
        };
        
        res.json({ 
            success: true, 
            data: mockInfo,
            source: 'mock',
            message: '模拟数据，实际数据获取失败'
        });
        
    } catch (error) {
        console.error('获取基金详情失败:', error);
        res.status(500).json({ 
            error: '获取基金详情失败',
            message: error.message 
        });
    }
});

// 3. 其他API接口（保持原有功能）
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM funds WHERE is_active = 1', (err, row) => {
        if (err) {
            return res.status(500).json({ error: '获取统计数据失败' });
        }
        res.json({
            success: true,
            data: {
                totalFunds: row.total,
                updatedToday: 0,
                lastUpdate: new Date().toLocaleString('zh-CN'),
                message: '服务器运行正常'
            }
        });
    });
});

app.post('/api/fund/add', (req, res) => {
    try {
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
    } catch (error) {
        console.error('添加基金失败:', error);
        res.status(500).json({ error: '添加基金失败' });
    }
});

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

// 首页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动HTTP服务器
app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT}`);
});

// 启动HTTPS服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        // 强制使用TLS 1.2
        secureProtocol: 'TLSv1_2_method',
        ciphers: [
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'DHE-RSA-AES128-GCM-SHA256',
            'DHE-RSA-AES256-GCM-SHA384'
        ].join(':'),
        honorCipherOrder: true
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
        console.log(`LOF基金查询系统已启动 (修复版)`);
        console.log(`\n🔐 安全配置:`);
        console.log(`   访问控制: 用户名/密码保护`);
        console.log(`   加密传输: HTTPS启用 (TLS 1.2)`);
        console.log(`   SSL证书: 自签名证书`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTP: http://43.161.221.10:${HTTP_PORT}`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`\n🔑 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n📊 功能特性:`);
        console.log(`   真实API + 模拟数据备用`);
        console.log(`   支持162411等LOF基金搜索`);
        console.log(`   自动降级机制`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}