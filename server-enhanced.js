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
    realm: 'LOF Fund Tracker Enhanced'
}));

// 数据库
const db = new sqlite3.Database('./funds.db');

// 获取华宝官网数据
async function getFsfundData(code) {
    try {
        const pythonScript = path.join(__dirname, 'fsfund_fetcher.py');
        const result = execSync(`python3 "${pythonScript}" "${code}"`, {
            encoding: 'utf-8',
            timeout: 8000
        });
        
        return JSON.parse(result);
    } catch (error) {
        console.log(`华宝官网数据获取失败: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// 获取AkShare场内价格
async function getAksharePrice(code) {
    try {
        const pythonScript = path.join(__dirname, 'akshare_fetcher_simple.py');
        const result = execSync(`python3 "${pythonScript}" "${code}"`, {
            encoding: 'utf-8',
            timeout: 8000
        });
        
        return JSON.parse(result);
    } catch (error) {
        console.log(`AkShare数据获取失败: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// 获取东方财富数据
async function getEastmoneyData(code) {
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
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' },
            { code: '160416', name: '华安石油指数(LOF)', type: 'LOF' }
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

// 2. 获取基金详情（增强版 - 多数据源）
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    
    console.log(`获取基金数据（多数据源）: ${code}`);
    
    try {
        // 并行获取三个数据源
        const [eastmoneyResult, fsfundResult, akshareResult] = await Promise.allSettled([
            getEastmoneyData(code),
            getFsfundData(code),
            getAksharePrice(code)
        ]);
        
        // 处理东方财富数据
        let eastmoneyData = null;
        if (eastmoneyResult.status === 'fulfilled' && eastmoneyResult.value.success) {
            eastmoneyData = eastmoneyResult.value.data;
        }
        
        // 处理华宝官网数据
        let fsfundData = null;
        if (fsfundResult.status === 'fulfilled' && fsfundResult.value.success) {
            fsfundData = fsfundResult.value.data;
        }
        
        // 处理AkShare数据
        let akshareData = null;
        if (akshareResult.status === 'fulfilled' && akshareResult.value.success) {
            akshareData = akshareResult.value.data;
        }
        
        // 构建响应数据
        const fundInfo = {
            code: code,
            name: eastmoneyData?.fundName || `基金 ${code}`,
            
            // 净值数据（多数据源）
            netValue: {
                eastmoney: eastmoneyData?.netValue || '--',
                fsfund: fsfundData?.netValue || '--',
                fsfundDate: fsfundData?.date || '--',
                recommendation: fsfundData?.netValue || eastmoneyData?.netValue || '--'
            },
            
            // 累计净值
            totalValue: {
                eastmoney: eastmoneyData?.totalValue || '--',
                fsfund: fsfundData?.totalValue || '--'
            },
            
            // 场内价格
            marketPrice: akshareData?.price ? akshareData.price.toFixed(4) : '--',
            marketPriceSource: akshareData?.source || 'none',
            
            // 基金信息
            fundType: eastmoneyData?.fundType || '未知',
            isLOF: true,
            subscriptionStatus: eastmoneyData?.subscriptionStatus || '未知',
            purchaseLimit: eastmoneyData?.purchaseLimit || '无限制',
            
            // 元数据
            updateTime: new Date().toLocaleString('zh-CN'),
            sources: {
                eastmoney: eastmoneyData ? '成功' : '失败',
                fsfund: fsfundData ? '成功' : '失败',
                akshare: akshareData ? '成功' : '失败'
            },
            urls: {
                eastmoney: eastmoneyData?.url || `https://fund.eastmoney.com/${code}.html`,
                fsfund: fsfundData ? `https://www.fsfund.com/fund/${code}/fundDetail.shtml` : null
            }
        };
        
        // 计算折溢价率（使用推荐净值）
        if (fundInfo.marketPrice !== '--' && fundInfo.netValue.recommendation !== '--') {
            try {
                const marketPriceNum = parseFloat(fundInfo.marketPrice);
                const netValueNum = parseFloat(fundInfo.netValue.recommendation.split('-')[0] || fundInfo.netValue.recommendation);
                
                if (netValueNum > 0) {
                    const premium = ((marketPriceNum - netValueNum) / netValueNum * 100).toFixed(2);
                    fundInfo.premiumRate = `${premium}%`;
                    
                    // 计算相对于华宝官网的折溢价率
                    if (fundInfo.netValue.fsfund !== '--') {
                        const fsfundNum = parseFloat(fundInfo.netValue.fsfund);
                        if (fsfundNum > 0) {
                            const premiumFsfund = ((marketPriceNum - fsfundNum) / fsfundNum * 100).toFixed(2);
                            fundInfo.premiumRateFsfund = `${premiumFsfund}%`;
                        }
                    }
                }
            } catch (e) {
                fundInfo.premiumRate = '--';
            }
        } else {
            fundInfo.premiumRate = '--';
        }
        
        // 净值差异分析
        if (fundInfo.netValue.eastmoney !== '--' && fundInfo.netValue.fsfund !== '--') {
            try {
                const eastmoneyNum = parseFloat(fundInfo.netValue.eastmoney.split('-')[0] || fundInfo.netValue.eastmoney);
                const fsfundNum = parseFloat(fundInfo.netValue.fsfund);
                
                if (fsfundNum > 0) {
                    const diffPercent = ((eastmoneyNum - fsfundNum) / fsfundNum * 100).toFixed(2);
                    fundInfo.netValueDiff = `${diffPercent}%`;
                }
            } catch (e) {
                fundInfo.netValueDiff = '--';
            }
        }
        
        res.json({
            success: true,
            data: fundInfo,
            message: '多数据源获取成功',
            timestamp: new Date().toISOString()
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

// 其他API保持不变...

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        secureProtocol: 'TLSv1_2_method'
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✅ 增强版HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
    });
    
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`✅ 增强版HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT}`);
        console.log(`\n🎉 LOF基金查询系统（多数据源版）已启动`);
        console.log(`\n🔐 登录信息: admin / Admin123456`);
        console.log(`\n📊 数据源:`);
        console.log(`   1. 东方财富 (实时净值)`);
        console.log(`   2. 华宝官网 (官方净值)`);
        console.log(`   3. AkShare (场内价格)`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
    });
} catch (error) {
    console.log('启动失败:', error.message);
}