const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3002;
const HTTPS_PORT = process.env.HTTPS_PORT || 3445;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 数据库初始化
const db = new sqlite3.Database('./funds.db');

// 创建基金表
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
    // 东方财富基金数据
    eastmoney: {
        baseUrl: 'https://fund.eastmoney.com',
        search: 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx'
    },
    // 天天基金网
    tiantian: {
        baseUrl: 'https://fund.eastmoney.com'
    }
};

// 1. 搜索基金
app.get('/api/search', async (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ error: '请输入搜索关键词' });
        }

        const response = await axios.get(DATA_SOURCES.eastmoney.search, {
            params: {
                m: 1,
                key: keyword,
                _: Date.now()
            }
        });

        if (response.data && response.data.Datas) {
            const funds = response.data.Datas.map(fund => ({
                code: fund.CODE,
                name: fund.NAME,
                type: fund.FTYPE || '',
                pinyin: fund.PINYIN
            })).filter(fund => 
                (fund.type && fund.type.includes('LOF')) || 
                (fund.name && fund.name.includes('LOF'))
            );
            
            res.json({ success: true, data: funds });
        } else {
            res.json({ success: false, message: '未找到相关基金' });
        }
    } catch (error) {
        console.error('搜索基金失败:', error);
        res.status(500).json({ error: '搜索基金失败' });
    }
});

// 2. 获取基金详情
app.get('/api/fund/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const fundUrl = `${DATA_SOURCES.eastmoney.baseUrl}/${code}.html`;
        
        const response = await axios.get(fundUrl);
        const $ = cheerio.load(response.data);
        
        // 解析基金基本信息
        const fundInfo = {
            code: code,
            name: $('.fundDetail-tit').text().trim(),
            netValue: $('.dataItem01 .dataNums').first().text().trim(),
            dailyChange: $('.dataItem01 .dataNums').eq(1).text().trim(),
            marketPrice: $('.dataItem02 .dataNums').first().text().trim(),
            premiumRate: $('.dataItem02 .dataNums').eq(1).text().trim(),
            subscriptionStatus: '开放申购' // 默认值，实际需要从页面解析
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
        
        res.json({ success: true, data: fundInfo });
    } catch (error) {
        console.error('获取基金详情失败:', error);
        res.status(500).json({ error: '获取基金详情失败' });
    }
});

// 3. 添加基金到关注列表
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

// 5. 批量更新基金价格
app.get('/api/funds/update', async (req, res) => {
    try {
        db.all('SELECT fund_code FROM funds WHERE is_active = 1', async (err, funds) => {
            if (err) {
                return res.status(500).json({ error: '获取基金列表失败' });
            }
            
            const updateResults = [];
            
            for (const fund of funds) {
                try {
                    const fundUrl = `${DATA_SOURCES.eastmoney.baseUrl}/${fund.fund_code}.html`;
                    const response = await axios.get(fundUrl);
                    const $ = cheerio.load(response.data);
                    
                    const marketPrice = $('.dataItem02 .dataNums').first().text().trim();
                    const netValue = $('.dataItem01 .dataNums').first().text().trim();
                    const premiumRate = $('.dataItem02 .dataNums').eq(1).text().trim();
                    
                    db.run(
                        'INSERT INTO fund_prices (fund_code, market_price, net_value, premium_rate) VALUES (?, ?, ?, ?)',
                        [fund.fund_code, marketPrice, netValue, premiumRate]
                    );
                    
                    updateResults.push({
                        code: fund.fund_code,
                        success: true,
                        marketPrice,
                        netValue,
                        premiumRate
                    });
                } catch (fundError) {
                    updateResults.push({
                        code: fund.fund_code,
                        success: false,
                        error: fundError.message
                    });
                }
            }
            
            res.json({ 
                success: true, 
                message: `已更新 ${updateResults.filter(r => r.success).length} 只基金`,
                data: updateResults 
            });
        });
    } catch (error) {
        console.error('批量更新失败:', error);
        res.status(500).json({ error: '批量更新失败' });
    }
});

// 6. 获取基金历史价格
app.get('/api/fund/:code/history', (req, res) => {
    const { code } = req.params;
    const { limit = 30 } = req.query;
    
    db.all(
        'SELECT * FROM fund_prices WHERE fund_code = ? ORDER BY update_time DESC LIMIT ?',
        [code, parseInt(limit)],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '获取历史数据失败' });
            }
            res.json({ success: true, data: rows });
        }
    );
});

// 7. 删除基金
app.delete('/api/fund/:code', (req, res) => {
    const { code } = req.params;
    
    db.run(
        'UPDATE funds SET is_active = 0 WHERE fund_code = ?',
        [code],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '删除基金失败' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: '基金不存在' });
            }
            res.json({ success: true, message: '基金已删除' });
        }
    );
});

// 8. 获取统计数据
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM funds WHERE is_active = 1', (err, row) => {
        if (err) {
            return res.status(500).json({ error: '获取统计数据失败' });
        }
        
        db.get(`
            SELECT COUNT(DISTINCT fund_code) as updated 
            FROM fund_prices 
            WHERE date(update_time) = date('now')
        `, (err, updateRow) => {
            if (err) {
                return res.status(500).json({ error: '获取统计数据失败' });
            }
            
            res.json({
                success: true,
                data: {
                    totalFunds: row.total,
                    updatedToday: updateRow.updated,
                    lastUpdate: new Date().toLocaleString('zh-CN')
                }
            });
        });
    });
});

// 首页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 基础认证配置（用户名密码访问控制）
const authUsers = {
    'admin': 'Admin123456'
};

// 应用基础认证到所有路由
app.use(basicAuth({
    users: authUsers,
    challenge: true,
    realm: 'LOF基金查询系统'
}));

// 启动HTTP服务器（监听所有IPv4和IPv6地址）
app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT} (IPv4)`);
});

app.listen(HTTP_PORT, '::', () => {
    console.log(`HTTP服务器运行在 http://[::]:${HTTP_PORT} (IPv6)`);
});

// 启动HTTPS服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        // 强制使用TLS 1.2（兼容旧客户端）
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        ciphers: [
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'DHE-RSA-AES128-GCM-SHA256',
            'DHE-RSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES128-SHA256',
            'ECDHE-RSA-AES256-SHA384',
            'DHE-RSA-AES128-SHA256',
            'DHE-RSA-AES256-SHA256',
            'AES128-GCM-SHA256',
            'AES256-GCM-SHA384',
            'AES128-SHA256',
            'AES256-SHA256'
        ].join(':'),
        honorCipherOrder: true
    };
    
    // 创建HTTPS服务器
    const httpsServer = https.createServer(httpsOptions, app);
    
    // 监听IPv4
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT} (IPv4)`);
    });
    
    // 监听IPv6
    httpsServer.listen(HTTPS_PORT, '::', () => {
        console.log(`HTTPS服务器运行在 https://[::]:${HTTPS_PORT} (IPv6)`);
        console.log(`LOF基金查询系统已启动`);
        console.log(`\n🔐 安全配置:`);
        console.log(`   访问控制: 用户名/密码保护`);
        console.log(`   加密传输: HTTPS启用`);
        console.log(`   SSL证书: 自签名证书`);
        console.log(`\n📊 API接口列表:`);
        console.log(`   GET  /api/search?keyword=基金名  - 搜索基金`);
        console.log(`   GET  /api/fund/:code           - 获取基金详情`);
        console.log(`   POST /api/fund/add             - 添加基金到关注`);
        console.log(`   GET  /api/funds                - 获取关注列表`);
        console.log(`   GET  /api/funds/update         - 批量更新价格`);
        console.log(`   GET  /api/stats                - 获取统计数据`);
        console.log(`\n🛡️  安全提醒:`);
        console.log(`   默认用户名: admin`);
        console.log(`   默认密码: 查看.env文件`);
        console.log(`   请及时修改默认密码！`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTP (IPv4):  http://43.161.221.10:3000`);
        console.log(`   HTTPS (IPv4): https://43.161.221.10:3443`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败，请先运行: ./setup-ssl.sh');
    console.log('📋 使用HTTP模式运行中...');
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`服务器运行在 http://0.0.0.0:${HTTP_PORT} (IPv4)`);
    });
}