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
const HTTP_PORT = 3007;
const HTTPS_PORT = 3449;

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

// 测试数据（备用）
const TEST_FUNDS = {
    '162411': { name: '华宝油气(LOF)', category: '油气' },
    '161725': { name: '招商中证白酒指数(LOF)A', category: '白酒' },
    '161726': { name: '招商国证生物医药指数(LOF)A', category: '医药' },
    '501018': { name: '南方原油(LOF)', category: '原油' },
    '160416': { name: '华安石油(LOF)', category: '石油' },
    '160719': { name: '嘉实黄金(LOF)', category: '黄金' }
};

// 1. 搜索基金 - 优先真实API，失败时用测试数据
app.get('/api/search', async (req, res) => {
    const { keyword, forceMock } = req.query;
    
    if (!keyword) {
        return res.json({ 
            success: true, 
            data: Object.keys(TEST_FUNDS).map(code => ({
                code,
                name: TEST_FUNDS[code].name,
                type: 'LOF',
                category: TEST_FUNDS[code].category,
                source: 'test'
            })),
            message: '所有LOF基金列表（测试数据）'
        });
    }
    
    // 如果强制使用测试数据
    if (forceMock === 'true') {
        return searchTestData(keyword, res);
    }
    
    // 尝试真实API
    try {
        console.log(`尝试真实API搜索: ${keyword}`);
        
        const response = await axios.get('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx', {
            params: {
                m: 1,
                key: keyword,
                _: Date.now()
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && response.data.Datas) {
            const funds = response.data.Datas.map(fund => ({
                code: fund.CODE,
                name: fund.NAME,
                type: fund.FTYPE || '',
                pinyin: fund.PINYIN,
                source: 'real'
            })).filter(fund => 
                (fund.type && fund.type.includes('LOF')) || 
                (fund.name && fund.name.includes('LOF')) ||
                fund.code === keyword
            );
            
            if (funds.length > 0) {
                console.log(`真实API找到 ${funds.length} 个LOF基金`);
                return res.json({ 
                    success: true, 
                    data: funds,
                    source: 'real',
                    message: `从真实API找到 ${funds.length} 个LOF基金`
                });
            }
        }
        
        // 真实API没找到，降级到测试数据
        console.log('真实API未找到，降级到测试数据');
        return searchTestData(keyword, res);
        
    } catch (apiError) {
        console.log('真实API失败，使用测试数据:', apiError.message);
        return searchTestData(keyword, res);
    }
});

// 测试数据搜索函数
function searchTestData(keyword, res) {
    const results = [];
    
    // 精确匹配
    if (TEST_FUNDS[keyword]) {
        results.push({
            code: keyword,
            name: TEST_FUNDS[keyword].name,
            type: 'LOF',
            category: TEST_FUNDS[keyword].category,
            source: 'test',
            match: 'exact'
        });
    }
    
    // 代码包含
    Object.keys(TEST_FUNDS).forEach(code => {
        if (code.includes(keyword) && code !== keyword) {
            results.push({
                code,
                name: TEST_FUNDS[code].name,
                type: 'LOF',
                category: TEST_FUNDS[code].category,
                source: 'test',
                match: 'code_contains'
            });
        }
    });
    
    // 名称包含
    Object.keys(TEST_FUNDS).forEach(code => {
        if (TEST_FUNDS[code].name.includes(keyword) && !results.find(r => r.code === code)) {
            results.push({
                code,
                name: TEST_FUNDS[code].name,
                type: 'LOF',
                category: TEST_FUNDS[code].category,
                source: 'test',
                match: 'name_contains'
            });
        }
    });
    
    res.json({
        success: true,
        data: results,
        source: 'test',
        keyword,
        total: results.length,
        message: results.length > 0 ? `从测试数据找到 ${results.length} 个LOF基金` : '未找到相关LOF基金'
    });
}

// 2. 获取基金详情 - 混合模式
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    const { forceMock } = req.query;
    
    // 如果强制使用测试数据
    if (forceMock === 'true') {
        return getTestFundDetail(code, res);
    }
    
    // 尝试真实API
    try {
        console.log(`尝试真实API获取基金详情: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // 解析真实数据
        const fundInfo = {
            code: code,
            name: $('.fundDetail-tit').text().trim() || TEST_FUNDS[code]?.name || `基金 ${code}`,
            netValue: $('.dataItem01 .dataNums').first().text().trim() || '--',
            dailyChange: $('.dataItem01 .dataNums').eq(1).text().trim() || '--',
            marketPrice: $('.dataItem02 .dataNums').first().text().trim() || '--',
            premiumRate: $('.dataItem02 .dataNums').eq(1).text().trim() || '--',
            subscriptionStatus: '开放申购',
            source: 'real',
            updateTime: new Date().toLocaleString('zh-CN')
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
        
        return res.json({ 
            success: true, 
            data: fundInfo,
            source: 'real',
            message: '从真实API获取数据成功'
        });
        
    } catch (apiError) {
        console.log('真实API失败，使用测试数据:', apiError.message);
        return getTestFundDetail(code, res);
    }
});

// 测试数据详情函数
function getTestFundDetail(code, res) {
    if (!TEST_FUNDS[code]) {
        return res.status(404).json({
            success: false,
            error: '基金不存在',
            message: `基金代码 ${code} 不在支持的LOF基金列表中`
        });
    }
    
    const fundInfo = TEST_FUNDS[code];
    const now = new Date();
    
    const fundData = {
        code: code,
        name: fundInfo.name,
        category: fundInfo.category,
        netValue: (Math.random() * 2 + 1).toFixed(4),
        dailyChange: (Math.random() * 0.1 - 0.05).toFixed(2) + '%',
        marketPrice: (Math.random() * 2 + 1).toFixed(4),
        premiumRate: (Math.random() * 0.2 - 0.1).toFixed(2) + '%',
        subscriptionStatus: Math.random() > 0.3 ? '开放申购' : '暂停申购',
        source: 'test',
        updateTime: now.toLocaleString('zh-CN'),
        note: '测试数据，非实时市场数据'
    };
    
    // 保存到数据库
    db.run(
        'INSERT OR IGNORE INTO funds (fund_code, fund_name) VALUES (?, ?)',
        [code, fundInfo.name]
    );
    
    res.json({
        success: true,
        data: fundData,
        source: 'test',
        message: '测试数据，真实API获取失败'
    });
}

// 3. 手动更新真实数据
app.get('/api/update/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        console.log(`手动更新真实数据: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        const fundInfo = {
            code: code,
            name: $('.fundDetail-tit').text().trim() || TEST_FUNDS[code]?.name || `基金 ${code}`,
            netValue: $('.dataItem01 .dataNums').first().text().trim(),
            dailyChange: $('.dataItem01 .dataNums').eq(1).text().trim(),
            marketPrice: $('.dataItem02 .dataNums').first().text().trim(),
            premiumRate: $('.dataItem02 .dataNums').eq(1).text().trim(),
            subscriptionStatus: '开放申购',
            source: 'real_manual',
            updateTime: new Date().toLocaleString('zh-CN'),
            rawHtmlLength: response.data.length
        };
        
        // 检查申购状态
        const statusText = $('.static').text();
        if (statusText.includes('暂停申购')) {
            fundInfo.subscriptionStatus = '暂停申购';
        } else if (statusText.includes('限制申购')) {
            fundInfo.subscriptionStatus = '限制申购';
        }
        
        res.json({
            success: true,
            data: fundInfo,
            message: '手动更新成功',
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('手动更新失败:', error.message);
        res.status(500).json({
            success: false,
            error: '更新失败',
            message: error.message,
            suggestion: '请检查网络连接或基金代码是否正确'
        });
    }
});

// 4. 其他API
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            totalFunds: Object.keys(TEST_FUNDS).length,
            updatedToday: 0,
            lastUpdate: new Date().toLocaleString('zh-CN'),
            message: '混合模式服务器运行正常',
            version: '1.0.0',
            mode: 'hybrid',
            supportedFunds: Object.keys(TEST_FUNDS).length,
            features: ['真实API', '测试数据', '自动降级', '手动更新']
        }
    });
});

// 5. 获取数据源状态
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: {
            server: '运行中',
            mode: '混合模式',
            realAPI: '可用（自动降级）',
            testData: '可用',
            ports: {
                http: HTTP_PORT,
                https: HTTPS_PORT
            },
            timestamp: Date.now()
        }
    });
});

// 首页路由
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
        console.log(`\n🎉 LOF基金查询系统已启动（混合模式）`);
        console.log(`\n🔐 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n📊 数据模式:`);
        console.log(`   🔄 自动切换: 优先真实API，失败用测试数据`);
        console.log(`   📡 真实API: 东方财富基金数据`);
        console.log(`   🧪 测试数据: 6个常见LOF基金`);
        console.log(`   🔧 手动更新: /api/update/基金代码`);
        console.log(`\n🚀 测试命令:`);
        console.log(`   搜索（真实API）: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search?keyword=162411"`);
        console.log(`   搜索（测试数据）: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search?keyword=162411&forceMock=true"`);
        console.log(`   手动更新: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/update/162411"`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}