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
const HTTP_PORT = 3001;  // 使用不同端口避免冲突
const HTTPS_PORT = 3444; // 使用不同端口避免冲突

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

// 简单的API路由
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

app.get('/api/search', async (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ error: '请输入搜索关键词' });
        }

        // 模拟返回一些基金数据
        const mockFunds = [
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' }
        ];
        
        res.json({ success: true, data: mockFunds });
    } catch (error) {
        console.error('搜索基金失败:', error);
        res.status(500).json({ error: '搜索基金失败' });
    }
});

app.get('/api/fund/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        // 模拟基金数据
        const fundInfo = {
            code: code,
            name: '模拟基金 ' + code,
            netValue: (Math.random() * 2 + 1).toFixed(4),
            dailyChange: (Math.random() * 0.1 - 0.05).toFixed(2) + '%',
            marketPrice: (Math.random() * 2 + 1).toFixed(4),
            premiumRate: (Math.random() * 0.2 - 0.1).toFixed(2) + '%',
            subscriptionStatus: Math.random() > 0.5 ? '开放申购' : '暂停申购'
        };
        
        res.json({ success: true, data: fundInfo });
    } catch (error) {
        console.error('获取基金详情失败:', error);
        res.status(500).json({ error: '获取基金详情失败' });
    }
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
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
        console.log(`LOF基金查询系统已启动`);
        console.log(`\n🔐 安全配置:`);
        console.log(`   访问控制: 用户名/密码保护`);
        console.log(`   加密传输: HTTPS启用 (TLS 1.2)`);
        console.log(`   SSL证书: 自签名证书`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTP: http://43.161.221.10:${HTTP_PORT}`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`\n🔑 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: 9moFkjbVBTrJkd50`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}