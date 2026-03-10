const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const HTTP_PORT = 3001;
const HTTPS_PORT = 3444;

// 中间件 - 无认证！
app.use(cors());
app.use(express.json());

// 首页路由 - 必须在静态文件服务之前定义
app.get('/', (req, res) => {
    // 重定向到最新完整版
    res.redirect('/index-complete.html');
});

// 保留旧版index.html的兼容性
app.get('/index.html', (req, res) => {
    res.redirect('/index-complete.html');
});

// 静态文件服务 - 放在路由之后
app.use(express.static('public'));

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
        
        // 尝试多种选择器获取净值
        let netValue = '--';
        let dailyChange = '--';
        let totalValue = '--';
        
        // 方法1：标准选择器
        const netValue1 = $('.dataItem01 .dataNums').first().text().trim();
        const dailyChange1 = $('.dataItem01 .dataNums').eq(1).text().trim();
        const totalValue1 = $('.dataItem02 .dataNums').first().text().trim();
        
        if (netValue1) {
            netValue = netValue1;
            dailyChange = dailyChange1;
            totalValue = totalValue1;
        } else {
            // 方法2：备用选择器
            const netValue2 = $('.fundDetail-dataItem .fundDetail-data').first().text().trim();
            if (netValue2) {
                netValue = netValue2;
            }
        }
        
        // 处理净值和涨跌幅合并的情况
        // 如果netValue包含类似 "0.86721.03%" 的格式，尝试分离
        if (netValue && netValue.includes('%') && !netValue.includes(' ')) {
            // 尝试匹配 "数字.数字数字.数字%" 格式
            const match = netValue.match(/^(\d+\.?\d*)(-?\d+\.?\d*)%$/);
            if (match) {
                const actualNetValue = match[1];  // 0.8672
                const actualDailyChange = match[2] + '%';  // 1.03%
                netValue = actualNetValue;
                
                // 如果dailyChange是"--"，使用分离出来的涨跌幅
                if (dailyChange === '--' || dailyChange === '') {
                    dailyChange = actualDailyChange;
                }
            }
        }
        
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

// 1. 搜索基金（改进版：搜索数据库+固定列表）
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.json({ success: true, data: [] });
    }
    
    try {
        // 1. 从数据库搜索
        const dbResults = await new Promise((resolve, reject) => {
            const query = `
                SELECT fund_code as code, fund_name as name, 'LOF' as type 
                FROM funds 
                WHERE fund_code LIKE ? OR fund_name LIKE ?
                LIMIT 20
            `;
            db.all(query, [`%${keyword}%`, `%${keyword}%`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // 2. 固定列表（作为补充）
        const commonLOFs = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF' },
            { code: '161226', name: '国投瑞银白银期货(LOF)A', type: 'LOF' }
        ];
        
        // 3. 合并结果，去重
        const allResults = [...dbResults];
        for (const fund of commonLOFs) {
            if (fund.code.includes(keyword) || fund.name.includes(keyword)) {
                // 检查是否已存在
                const exists = allResults.some(f => f.code === fund.code);
                if (!exists) {
                    allResults.push(fund);
                }
            }
        }
        
        res.json({
            success: true,
            data: allResults,
            message: allResults.length > 0 ? `找到 ${allResults.length} 个基金` : '未找到相关基金'
        });
        
    } catch (error) {
        console.error('搜索失败:', error);
        // 如果数据库搜索失败，回退到固定列表
        try {
            const commonLOFs = [
                { code: '162411', name: '华宝油气(LOF)', type: 'LOF' },
                { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF' },
                { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF' },
                { code: '501018', name: '南方原油(LOF)', type: 'LOF' },
                { code: '161226', name: '国投瑞银白银期货(LOF)A', type: 'LOF' }
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
        } catch (fallbackError) {
            res.json({
                success: false,
                error: '搜索失败',
                message: error.message
            });
        }
    }
});

// 2. 获取基金详情（免认证版）
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    
    console.log(`[免认证] 获取基金数据: ${code}`);
    
    try {
        // 并行获取三种数据
        const [officialResult, estimationResult, marketResult] = await Promise.allSettled([
            getOfficialData(code),
            getEstimationData(code),
            getMarketPrice(code)
        ]);
        
        // 构建响应数据
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
                premiumRate: '--',           // 基于官方净值的折溢价率
                premiumRateEst: '--',        // 基于实时估值的折溢价率
                estimationDiff: '--',        // 估值差异
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
        
        // 设置基金名称
        fundInfo.name = fundInfo.estimation.fundName || `基金 ${code}`;
        
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
                console.log('折溢价率（官方）计算失败:', e.message);
            }
        }
        
        // 计算折溢价率（基于实时估值）
        if (fundInfo.estimation.netValue !== '--' && fundInfo.market.price !== '--') {
            try {
                // 从估值字符串中提取净值（可能包含涨跌幅）
                const estimationStr = fundInfo.estimation.netValue;
                const estimationMatch = estimationStr.match(/(\d+\.?\d*)/);
                const estimationValue = estimationMatch ? parseFloat(estimationMatch[1]) : 0;
                const marketPrice = parseFloat(fundInfo.market.price);
                
                if (estimationValue > 0) {
                    const premiumEst = ((marketPrice - estimationValue) / estimationValue * 100).toFixed(2);
                    fundInfo.calculations.premiumRateEst = `${premiumEst}%`;
                }
            } catch (e) {
                console.log('折溢价率（估值）计算失败:', e.message);
            }
        }
        
        // 计算估值差异
        if (fundInfo.official.netValue !== '--' && fundInfo.estimation.netValue !== '--') {
            try {
                const officialValue = parseFloat(fundInfo.official.netValue);
                const estimationStr = fundInfo.estimation.netValue;
                const estimationMatch = estimationStr.match(/(\d+\.?\d*)/);
                const estimationValue = estimationMatch ? parseFloat(estimationMatch[1]) : 0;
                
                if (officialValue > 0) {
                    const diff = ((estimationValue - officialValue) / officialValue * 100).toFixed(2);
                    fundInfo.calculations.estimationDiff = `${diff}%`;
                }
            } catch (e) {
                console.log('估值差异计算失败:', e.message);
            }
        }
        
        res.json({
            success: true,
            data: fundInfo,
            message: '数据获取成功（免认证版）',
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

// 3. 获取关注列表（兼容前端）
app.get('/api/funds', (req, res) => {
    // 由于是免认证版，返回空列表或测试数据
    res.json({
        success: true,
        data: [
            {
                fund_code: '162411',
                fund_name: '华宝油气(LOF)',
                is_active: 1,
                created_at: new Date().toISOString()
            },
            {
                fund_code: '161725',
                fund_name: '招商中证白酒指数(LOF)A',
                is_active: 1,
                created_at: new Date().toISOString()
            }
        ],
        message: '关注列表（示例数据）'
    });
});

// 4. 获取统计数据（兼容前端）
app.get('/api/stats', (req, res) => {
    const now = new Date();
    const serverTime = now.toLocaleString('zh-CN');
    
    res.json({
        success: true,
        data: {
            // 前端期望的字段
            totalFunds: 2,
            updatedToday: '2',  // 前端期望的字段
            lastUpdate: serverTime,  // 前端期望的字段
            
            // 原始字段（保持兼容）
            serverTime: serverTime,
            message: 'LOF基金查询系统运行正常',
            version: '1.0.0-noauth',
            note: '免认证版本，无需登录',
            
            // 额外信息
            timestamp: now.toISOString(),
            date: now.toLocaleDateString('zh-CN'),
            time: now.toLocaleTimeString('zh-CN')
        }
    });
});

// 5. 测试API连接（免认证）
app.get('/api/test', async (req, res) => {
    try {
        // 测试华宝官网
        const official = await getOfficialData('162411');
        
        res.json({
            success: true,
            message: '✅ 免认证API连接正常',
            sources: {
                official: official.success ? '✅ 正常' : '❌ 异常'
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

// 6. 服务器状态（兼容旧端点）
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: {
            serverTime: new Date().toLocaleString('zh-CN'),
            message: 'LOF基金查询系统（免认证版）运行正常',
            version: '1.0.0-noauth'
        }
    });
});

// 启动服务器
try {
    const httpsOptions = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        secureProtocol: 'TLSv1_2_method'
    };
    
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✅ 免认证HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
    });
    
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`✅ 免认证HTTP服务器运行在 http://0.0.0.0:${HTTP_PORT}`);
        console.log(`\n🎉 LOF基金查询系统（免认证版）已启动`);
        console.log(`\n📊 无需登录！直接访问`);
        console.log(`\n🌐 访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n🚀 测试命令:`);
        console.log(`   curl -k --tlsv1.2 "https://43.161.221.10:${HTTPS_PORT}/api/fund/162411"`);
    });
} catch (error) {
    console.log('启动失败:', error.message);
}