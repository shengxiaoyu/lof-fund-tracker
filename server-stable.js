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
    realm: 'LOF Fund Tracker'
}));

// 数据库
const db = new sqlite3.Database('./funds.db');

// 1. 搜索基金
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.json({ success: true, data: [] });
    }
    
    try {
        // 常见LOF基金列表
        const commonLOFs = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' },
            { code: '160416', name: '华安石油指数(LOF)', type: 'LOF' },
            { code: '160719', name: '嘉实黄金(LOF)', type: 'LOF' }
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

// 2. 获取基金详情（简化稳定版）
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        console.log(`获取基金数据: ${code}`);
        
        // 获取场外净值（东方财富）
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, { timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        // 提取基本信息
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
        
        // 获取场内价格（AkShare）
        let marketPrice = '--';
        let premiumRate = '--';
        let marketPriceSource = 'none';
        
        try {
            const pythonScript = path.join(__dirname, 'akshare_fetcher_simple.py');
            const result = execSync(`python3 "${pythonScript}" "${code}"`, {
                encoding: 'utf-8',
                timeout: 8000
            });
            
            const akData = JSON.parse(result);
            if (akData.success && akData.data && akData.data.price) {
                marketPrice = akData.data.price.toFixed(4);
                marketPriceSource = akData.data.source || 'akshare';
                
                // 计算折溢价率
                const netValueNum = parseFloat(netValue.split('-')[0] || netValue);
                if (netValueNum && netValueNum > 0) {
                    const premium = ((parseFloat(marketPrice) - netValueNum) / netValueNum * 100).toFixed(2);
                    premiumRate = `${premium}%`;
                }
            }
        } catch (akError) {
            console.log(`AkShare获取失败: ${akError.message}`);
            // 使用场外净值作为场内价格占位符
            marketPrice = netValue.split('-')[0] || netValue;
            marketPriceSource = 'estimated';
        }
        
        const fundInfo = {
            code: code,
            name: fundName,
            netValue: netValue,
            dailyChange: dailyChange,
            totalValue: totalValue,
            marketPrice: marketPrice,
            premiumRate: premiumRate,
            fundType: fundType,
            isLOF: true,
            subscriptionStatus: subscriptionStatus,
            purchaseLimit: purchaseLimit,
            updateTime: new Date().toLocaleString('zh-CN'),
            source: 'real',
            url: fundUrl,
            marketPriceSource: marketPriceSource
        };
        
        // 保存到数据库
        db.run(
            'INSERT OR REPLACE INTO funds (fund_code, fund_name) VALUES (?, ?)',
            [code, fundInfo.name]
        );
        
        res.json({
            success: true,
            data: fundInfo,
            message: '数据获取成功'
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

// 5. 删除基金
app.delete('/api/fund/:code', (req, res) => {
    const { code } = req.params;
    
    db.run(
        'UPDATE funds SET is_active = 0 WHERE fund_code = ?',
        [code],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '删除基金失败' });
            }
            res.json({ 
                success: true, 
                message: '基金删除成功'
            });
        }
    );
});

// 6. 服务器状态
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM funds WHERE is_active = 1', (err, row) => {
        if (err) {
            return res.status(500).json({ error: '获取统计数据失败' });
        }
        res.json({
            success: true,
            data: {
                totalFunds: row?.total || 0,
                serverTime: new Date().toLocaleString('zh-CN'),
                message: 'LOF基金查询系统运行正常',
                version: '1.0.0-stable',
                ports: {
                    http: HTTP_PORT,
                    https: HTTPS_PORT
                }
            }
        });
    });
});

// 7. 测试API连接
app.get('/api/test', async (req, res) => {
    try {
        await axios.get('https://fund.eastmoney.com/162411.html', { timeout: 5000 });
        res.json({
            success: true,
            message: '✅ API连接正常',
            timestamp: new Date().toLocaleString('zh-CN')
        });
    } catch (error) {
        res.json({
            success: false,
            message: '❌ API连接失败',
            error: error.message
        });
    }
});

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动HTTP服务器
app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT}`);
});

// 启动HTTPS服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        secureProtocol: 'TLSv1_2_method'
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✅ HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
        console.log(`\n🎉 LOF基金查询系统（稳定版）已启动`);
        console.log(`\n🔐 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n📊 数据源:`);
        console.log(`   场外净值: 东方财富实时数据`);
        console.log(`   场内价格: AkShare官方数据`);
        console.log(`\n🚀 测试命令:`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/test"`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/fund/162411"`);
    });
} catch (error) {
    console.log('⚠️ HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}