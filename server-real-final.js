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
const HTTP_PORT = 3010;
const HTTPS_PORT = 3452;

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
    '501018': { name: '南方原油(LOF)', category: '原油' }
};

// 1. 搜索基金 - 真实API
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    
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
            message: '请输入搜索关键词，如: 162411'
        });
    }
    
    // 如果是已知的LOF基金，直接返回
    if (TEST_FUNDS[keyword]) {
        return res.json({
            success: true,
            data: [{
                code: keyword,
                name: TEST_FUNDS[keyword].name,
                type: 'LOF',
                category: TEST_FUNDS[keyword].category,
                source: 'known'
            }],
            message: `找到 ${TEST_FUNDS[keyword].name}`
        });
    }
    
    // 尝试真实API搜索
    try {
        console.log(`真实API搜索: ${keyword}`);
        
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
                fund.code === keyword ||
                fund.code.includes(keyword)
            );
            
            if (funds.length > 0) {
                return res.json({ 
                    success: true, 
                    data: funds,
                    source: 'real',
                    message: `从真实API找到 ${funds.length} 个基金`
                });
            }
        }
        
        // 真实API没找到，尝试测试数据
        const testResults = Object.keys(TEST_FUNDS)
            .filter(code => 
                code.includes(keyword) || 
                TEST_FUNDS[code].name.includes(keyword) ||
                TEST_FUNDS[code].category.includes(keyword)
            )
            .map(code => ({
                code,
                name: TEST_FUNDS[code].name,
                type: 'LOF',
                category: TEST_FUNDS[code].category,
                source: 'test'
            }));
        
        if (testResults.length > 0) {
            return res.json({
                success: true,
                data: testResults,
                source: 'test',
                message: `从测试数据找到 ${testResults.length} 个LOF基金`
            });
        }
        
        // 都没找到
        res.json({
            success: true,
            data: [],
            message: '未找到相关基金',
            suggestion: '可以尝试搜索: 162411, 161725, 161726, 501018'
        });
        
    } catch (error) {
        console.error('搜索失败:', error.message);
        
        // API失败，使用测试数据
        const testResults = Object.keys(TEST_FUNDS)
            .filter(code => 
                code.includes(keyword) || 
                TEST_FUNDS[code].name.includes(keyword)
            )
            .map(code => ({
                code,
                name: TEST_FUNDS[code].name,
                type: 'LOF',
                category: TEST_FUNDS[code].category,
                source: 'test_fallback'
            }));
        
        res.json({
            success: true,
            data: testResults,
            source: 'test_fallback',
            message: testResults.length > 0 ? 
                `API失败，从测试数据找到 ${testResults.length} 个LOF基金` : 
                '未找到相关基金'
        });
    }
});

// 2. 获取基金详情 - 真实数据
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        console.log(`获取真实基金数据: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // 提取基金名称
        const fundName = $('.fundDetail-tit').text().trim() || 
                        TEST_FUNDS[code]?.name || 
                        `基金 ${code}`;
        
        // 提取净值数据
        const netValue = $('.dataItem01 .dataNums').first().text().trim() || '--';
        const dailyChange = $('.dataItem01 .dataNums').eq(1).text().trim() || '--';
        
        // 提取累计净值
        const totalValue = $('.dataItem02 .dataNums').first().text().trim() || '--';
        
        // 提取基金类型和风险等级
        const typeText = $('.infoOfFund td').first().text();
        const fundType = typeText.split('：')[1]?.split('|')[0]?.trim() || '未知';
        const riskLevel = typeText.includes('中高风险') ? '中高风险' : 
                         typeText.includes('高风险') ? '高风险' : '中风险';
        
        // 提取申购状态
        let subscriptionStatus = '开放申购';
        const statusText = $('.static').text();
        if (statusText.includes('暂停申购')) {
            subscriptionStatus = '暂停申购';
        } else if (statusText.includes('限制申购')) {
            subscriptionStatus = '限制申购';
        } else if (statusText.includes('限大额')) {
            subscriptionStatus = '限大额申购';
        }
        
        // 提取基金规模
        const scaleText = $('.infoOfFund td').eq(1).text();
        const fundScale = scaleText.split('：')[1]?.trim() || '--';
        
        // 提取基金经理
        const managerText = $('.infoOfFund td').eq(2).text();
        const fundManager = managerText.split('：')[1]?.trim() || '--';
        
        const fundInfo = {
            code: code,
            name: fundName,
            netValue: netValue,
            dailyChange: dailyChange,
            totalValue: totalValue,
            fundType: fundType,
            riskLevel: riskLevel,
            subscriptionStatus: subscriptionStatus,
            fundScale: fundScale,
            fundManager: fundManager,
            updateTime: new Date().toLocaleString('zh-CN'),
            source: 'real',
            url: fundUrl
        };
        
        // 保存到数据库
        db.run(
            'INSERT OR IGNORE INTO funds (fund_code, fund_name) VALUES (?, ?)',
            [code, fundInfo.name]
        );
        
        res.json({
            success: true,
            data: fundInfo,
            message: '真实数据获取成功',
            source: 'real'
        });
        
    } catch (error) {
        console.error('获取真实数据失败:', error.message);
        
        // 降级到测试数据
        if (TEST_FUNDS[code]) {
            const fundInfo = TEST_FUNDS[code];
            const now = new Date();
            
            const testData = {
                code: code,
                name: fundInfo.name,
                category: fundInfo.category,
                netValue: (Math.random() * 2 + 1).toFixed(4),
                dailyChange: (Math.random() * 0.1 - 0.05).toFixed(2) + '%',
                totalValue: (Math.random() * 2 + 1).toFixed(4),
                fundType: 'LOF',
                riskLevel: '中高风险',
                subscriptionStatus: Math.random() > 0.3 ? '开放申购' : '暂停申购',
                fundScale: (Math.random() * 50 + 10).toFixed(2) + '亿元',
                fundManager: '测试经理',
                updateTime: now.toLocaleString('zh-CN'),
                source: 'test',
                note: '真实API失败，使用测试数据'
            };
            
            res.json({
                success: true,
                data: testData,
                message: '测试数据（真实API失败）',
                source: 'test'
            });
        } else {
            res.status(404).json({
                success: false,
                error: '基金不存在',
                message: `基金代码 ${code} 不在支持的列表中`
            });
        }
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
                message: '基金删除成功',
                changes: this.changes
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
                updatedToday: 0,
                lastUpdate: new Date().toLocaleString('zh-CN'),
                message: 'LOF基金查询系统运行正常',
                version: '1.0.0',
                mode: '真实API + 测试数据备用',
                supportedFunds: Object.keys(TEST_FUNDS).length
            }
        });
    });
});

// 7. 测试API连接
app.get('/api/test', async (req, res) => {
    try {
        const response = await axios.get('https://fund.eastmoney.com/162411.html', {
            timeout: 5000
        });
        
        res.json({
            success: true,
            message: '✅ 真实API连接成功',
            status: 'connected',
            timestamp: new Date().toLocaleString('zh-CN')
        });
    } catch (error) {
        res.json({
            success: false,
            message: '❌ 真实API连接失败',
            error: error.message,
            timestamp: new Date().toLocaleString('zh-CN')
        });
    }
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
        console.log(`\n🎉 LOF基金查询系统已启动（真实API最终版）`);
        console.log(`\n🔐 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n📊 数据模式:`);
        console.log(`   🚀 优先真实API: 东方财富实时数据`);
        console.log(`   🧪 备用测试数据: 4个常见LOF基金`);
        console.log(`   🔄 自动降级: API失败时自动切换`);
        console.log(`\n🚀 支持搜索:`);
        console.log(`   162411 - 华宝油气(LOF) ✅`);
        console.log(`   161725 - 招商中证白酒指数(LOF)A ✅`);
        console.log(`   161726 - 招商国证生物医药指数(LOF)A ✅`);
        console.log(`   501018 - 南方原油(LOF) ✅`);
        console.log(`\n🔧 测试命令:`);
        console.log(`   搜索162411: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search?keyword=162411"`);
        console.log(`   获取详情: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/fund/162411"`);
        console.log(`   API测试: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/test"`);
        console.log(`\n💡 提示: 如果无法访问，请检查云服务商安全组是否开通端口 ${HTTPS_PORT}`);
    });
} catch (error) {
    console.log('⚠️ HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}