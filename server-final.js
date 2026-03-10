const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const basicAuth = require('express-basic-auth');

const app = express();
const HTTP_PORT = 3005;
const HTTPS_PORT = 3447;

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

// 1. 搜索基金 - 支持162411等LOF基金
app.get('/api/search', async (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ error: '请输入搜索关键词' });
        }

        console.log(`搜索基金: ${keyword}`);
        
        // 常见的LOF基金列表
        const lofFunds = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF', category: '油气' },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF', category: '白酒' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF', category: '医药' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF', category: '原油' },
            { code: '160416', name: '华安石油(LOF)', type: 'LOF', category: '石油' },
            { code: '160719', name: '嘉实黄金(LOF)', type: 'LOF', category: '黄金' },
            { code: '161028', name: '富国新能源汽车(LOF)', type: 'LOF', category: '新能源' },
            { code: '161029', name: '富国银行(LOF)', type: 'LOF', category: '银行' },
            { code: '161030', name: '富国食品饮料(LOF)', type: 'LOF', category: '食品饮料' },
            { code: '161031', name: '富国煤炭(LOF)', type: 'LOF', category: '煤炭' },
            { code: '161032', name: '富国钢铁(LOF)', type: 'LOF', category: '钢铁' },
            { code: '161033', name: '富国有色金属(LOF)', type: 'LOF', category: '有色金属' },
            { code: '161034', name: '富国房地产(LOF)', type: 'LOF', category: '房地产' },
            { code: '161035', name: '富国传媒(LOF)', type: 'LOF', category: '传媒' },
            { code: '161036', name: '富国计算机(LOF)', type: 'LOF', category: '计算机' },
            { code: '161037', name: '富国电子(LOF)', type: 'LOF', category: '电子' },
            { code: '161038', name: '富国军工(LOF)', type: 'LOF', category: '军工' },
            { code: '161039', name: '富国环保(LOF)', type: 'LOF', category: '环保' },
            { code: '161040', name: '富国农业(LOF)', type: 'LOF', category: '农业' },
            { code: '161041', name: '富国旅游(LOF)', type: 'LOF', category: '旅游' }
        ];

        // 搜索匹配
        const results = lofFunds.filter(fund => 
            fund.code.includes(keyword) || 
            fund.name.includes(keyword) ||
            fund.category.includes(keyword)
        );

        // 如果没有找到，添加一些建议
        if (results.length === 0 && keyword.length >= 2) {
            // 添加一些相关建议
            const suggestions = lofFunds.filter(fund => 
                fund.name.toLowerCase().includes(keyword.toLowerCase()) ||
                fund.category.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (suggestions.length > 0) {
                return res.json({ 
                    success: true, 
                    data: suggestions,
                    message: '找到相关基金'
                });
            }
        }

        res.json({ 
            success: true, 
            data: results,
            message: results.length > 0 ? `找到 ${results.length} 个基金` : '未找到相关基金'
        });
        
    } catch (error) {
        console.error('搜索基金失败:', error);
        res.status(500).json({ 
            error: '搜索基金失败',
            message: error.message 
        });
    }
});

// 2. 获取基金详情
app.get('/api/fund/:code', async (req, res) => {
    try {
        const { code } = req.params;
        console.log(`获取基金详情: ${code}`);
        
        // 模拟基金数据
        const fundInfo = {
            code: code,
            name: getFundName(code),
            netValue: (Math.random() * 2 + 1).toFixed(4),
            dailyChange: (Math.random() * 0.1 - 0.05).toFixed(2) + '%',
            marketPrice: (Math.random() * 2 + 1).toFixed(4),
            premiumRate: (Math.random() * 0.2 - 0.1).toFixed(2) + '%',
            subscriptionStatus: Math.random() > 0.3 ? '开放申购' : '暂停申购',
            updateTime: new Date().toLocaleString('zh-CN'),
            category: getFundCategory(code)
        };
        
        // 保存到数据库
        db.run(
            'INSERT OR IGNORE INTO funds (fund_code, fund_name) VALUES (?, ?)',
            [code, fundInfo.name]
        );
        
        res.json({ 
            success: true, 
            data: fundInfo,
            message: '基金数据获取成功'
        });
        
    } catch (error) {
        console.error('获取基金详情失败:', error);
        res.status(500).json({ 
            error: '获取基金详情失败',
            message: error.message 
        });
    }
});

// 辅助函数：获取基金名称
function getFundName(code) {
    const fundMap = {
        '162411': '华宝油气(LOF)',
        '161725': '招商中证白酒指数(LOF)A',
        '161726': '招商国证生物医药指数(LOF)A',
        '501018': '南方原油(LOF)',
        '160416': '华安石油(LOF)',
        '160719': '嘉实黄金(LOF)'
    };
    return fundMap[code] || `基金 ${code} (LOF)`;
}

// 辅助函数：获取基金类别
function getFundCategory(code) {
    const categoryMap = {
        '162411': '油气',
        '161725': '白酒',
        '161726': '医药',
        '501018': '原油',
        '160416': '石油',
        '160719': '黄金'
    };
    return categoryMap[code] || '其他';
}

// 3. 其他API接口
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM funds WHERE is_active = 1', (err, row) => {
        if (err) {
            return res.status(500).json({ error: '获取统计数据失败' });
        }
        res.json({
            success: true,
            data: {
                totalFunds: row?.total || 0,
                updatedToday: 0,
                lastUpdate: new Date().toLocaleString('zh-CN'),
                message: '服务器运行正常',
                version: '1.0.0',
                supportedFunds: 20
            }
        });
    });
});

// 4. 获取支持的LOF基金列表
app.get('/api/lof-funds', (req, res) => {
    const lofFunds = [
        { code: '162411', name: '华宝油气(LOF)', category: '油气' },
        { code: '161725', name: '招商中证白酒指数(LOF)A', category: '白酒' },
        { code: '161726', name: '招商国证生物医药指数(LOF)A', category: '医药' },
        { code: '501018', name: '南方原油(LOF)', category: '原油' },
        { code: '160416', name: '华安石油(LOF)', category: '石油' },
        { code: '160719', name: '嘉实黄金(LOF)', category: '黄金' }
    ];
    
    res.json({
        success: true,
        data: lofFunds,
        total: lofFunds.length,
        message: '支持的LOF基金列表'
    });
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
        secureProtocol: 'TLSv1_2_method',
        ciphers: 'HIGH:!aNULL:!MD5'
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
        console.log(`LOF基金查询系统已启动 (最终版)`);
        console.log(`\n🔐 安全配置:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTP: http://43.161.221.10:${HTTP_PORT}`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`\n📊 支持搜索的LOF基金:`);
        console.log(`   162411 - 华宝油气(LOF)`);
        console.log(`   161725 - 招商中证白酒指数(LOF)A`);
        console.log(`   161726 - 招商国证生物医药指数(LOF)A`);
        console.log(`   501018 - 南方原油(LOF)`);
        console.log(`   等20+个LOF基金`);
        console.log(`\n🚀 立即测试:`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search?keyword=162411"`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}