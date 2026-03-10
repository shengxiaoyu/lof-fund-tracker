const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const basicAuth = require('express-basic-auth');

const app = express();
const HTTP_PORT = 3008;
const HTTPS_PORT = 3450;

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

// 1. 测试真实API连接
app.get('/api/test', async (req, res) => {
    try {
        const response = await axios.get('https://fund.eastmoney.com/161725.html', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        res.json({
            success: true,
            message: '真实API连接成功',
            status: response.status,
            dataLength: response.data.length,
            timestamp: new Date().toLocaleString('zh-CN')
        });
    } catch (error) {
        res.json({
            success: false,
            message: '真实API连接失败',
            error: error.message,
            timestamp: new Date().toLocaleString('zh-CN')
        });
    }
});

// 2. 真实API搜索
app.get('/api/search/real', async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.status(400).json({ error: '请输入搜索关键词' });
    }
    
    try {
        console.log(`真实API搜索: ${keyword}`);
        
        const response = await axios.get('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx', {
            params: {
                m: 1,
                key: keyword,
                _: Date.now()
            },
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://fund.eastmoney.com/'
            }
        });
        
        if (response.data && response.data.Datas) {
            // 找到所有基金
            const allFunds = response.data.Datas.map(fund => ({
                code: fund.CODE,
                name: fund.NAME,
                type: fund.FTYPE || '',
                pinyin: fund.PINYIN
            }));
            
            // 筛选LOF基金
            const lofFunds = allFunds.filter(fund => 
                (fund.type && fund.type.includes('LOF')) || 
                (fund.name && fund.name.includes('LOF')) ||
                fund.code === keyword
            );
            
            res.json({
                success: true,
                data: {
                    all: allFunds,
                    lof: lofFunds
                },
                counts: {
                    total: allFunds.length,
                    lof: lofFunds.length
                },
                message: `找到 ${allFunds.length} 个基金，其中 ${lofFunds.length} 个LOF基金`,
                source: 'real'
            });
        } else {
            res.json({
                success: false,
                message: 'API返回数据格式错误',
                data: response.data
            });
        }
        
    } catch (error) {
        console.error('真实API搜索失败:', error.message);
        res.status(500).json({
            success: false,
            error: '搜索失败',
            message: error.message,
            suggestion: '请检查网络连接或稍后重试'
        });
    }
});

// 3. 获取真实基金数据
app.get('/api/fund/real/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        console.log(`获取真实基金数据: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://fund.eastmoney.com/'
            }
        });
        
        // 简单的HTML解析
        const html = response.data;
        
        // 提取基金名称
        const nameMatch = html.match(/<div class="fundDetail-tit">([^<]+)<\/div>/);
        const fundName = nameMatch ? nameMatch[1].trim() : `基金 ${code}`;
        
        // 提取净值
        const netValueMatch = html.match(/<span class="ui-font-large ui-color-green ui-num">([^<]+)<\/span>/);
        const netValue = netValueMatch ? netValueMatch[1].trim() : '--';
        
        // 提取涨跌幅
        const changeMatch = html.match(/<span class="ui-font-middle ui-color-green ui-num">([^<]+)<\/span>/g);
        const dailyChange = changeMatch && changeMatch[0] ? changeMatch[0].replace(/<[^>]+>/g, '') : '--';
        
        res.json({
            success: true,
            data: {
                code: code,
                name: fundName,
                netValue: netValue,
                dailyChange: dailyChange,
                url: fundUrl,
                htmlLength: html.length,
                updateTime: new Date().toLocaleString('zh-CN')
            },
            message: '真实数据获取成功',
            source: 'real'
        });
        
    } catch (error) {
        console.error('获取真实数据失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取失败',
            message: error.message,
            code: code,
            suggestion: '基金可能不存在或网络连接问题'
        });
    }
});

// 4. 测试数据搜索（备用）
app.get('/api/search/mock', (req, res) => {
    const { keyword } = req.query;
    
    const mockFunds = [
        { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
        { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
        { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
        { code: '501018', name: '南方原油(LOF)', type: 'LOF' }
    ];
    
    const results = mockFunds.filter(fund => 
        fund.code.includes(keyword) || 
        fund.name.includes(keyword)
    );
    
    res.json({
        success: true,
        data: results,
        source: 'mock',
        message: results.length > 0 ? `从测试数据找到 ${results.length} 个LOF基金` : '未找到相关基金'
    });
});

// 5. 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. 状态检查
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        server: '运行中',
        mode: '真实API测试',
        ports: {
            http: HTTP_PORT,
            https: HTTPS_PORT
        },
        features: [
            '真实API搜索',
            '真实基金数据',
            '测试数据备用',
            'API连接测试'
        ],
        timestamp: Date.now()
    });
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
        console.log(`\n🎉 LOF基金查询系统已启动（真实API模式）`);
        console.log(`\n🔐 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n📊 真实API测试:`);
        console.log(`   1. 测试API连接: /api/test`);
        console.log(`   2. 真实搜索: /api/search/real?keyword=162411`);
        console.log(`   3. 真实数据: /api/fund/real/162411`);
        console.log(`   4. 测试数据: /api/search/mock?keyword=162411`);
        console.log(`\n🚀 立即测试:`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/test"`);
        console.log(`   curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search/real?keyword=162411"`);
    });
} catch (error) {
    console.log('⚠️  HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}