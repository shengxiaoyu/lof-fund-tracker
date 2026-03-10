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
// 固定端口：3001 和 3444
const HTTP_PORT = 3001;
const HTTPS_PORT = 3444;

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

// 创建缓存表
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS fund_cache (
            fund_code TEXT PRIMARY KEY,
            fund_name TEXT NOT NULL,
            net_value TEXT,
            daily_change TEXT,
            total_value TEXT,
            fund_type TEXT,
            subscription_status TEXT,
            cache_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            source TEXT DEFAULT 'cache',
            raw_data TEXT
        )
    `);
});

// 1. 搜索基金 - 真实API（改进版）
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword) {
        return res.json({ 
            success: true, 
            data: [],
            message: '请输入搜索关键词，如: 162411'
        });
    }
    
    try {
        console.log(`搜索基金: ${keyword}`);
        
        // 尝试真实API
        const response = await axios.get('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx', {
            params: { m: 1, key: keyword, _: Date.now() },
            timeout: 10000
        });
        
        if (response.data && response.data.Datas) {
            const funds = response.data.Datas.map(fund => ({
                code: fund.CODE,
                name: fund.NAME,
                type: fund.FTYPE || '未知',
                pinyin: fund.PINYIN || '',
                isLOF: (fund.FTYPE && fund.FTYPE.includes('LOF')) || 
                       (fund.NAME && fund.NAME.includes('LOF')) ||
                       false
            })).filter(fund => 
                fund.isLOF || 
                fund.code === keyword ||
                fund.code.includes(keyword) ||
                fund.name.includes(keyword)
            );
            
            if (funds.length > 0) {
                return res.json({ 
                    success: true, 
                    data: funds,
                    source: 'real',
                    message: `找到 ${funds.length} 个基金`
                });
            }
        }
        
        // 没找到或API失败，尝试常见LOF基金
        const commonLOFs = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF', isLOF: true },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF', isLOF: true },
            { code: '161726', name: '招商国证生物医药指数(LOF)A', type: 'LOF', isLOF: true },
            { code: '501018', name: '南方原油(LOF)', type: 'LOF', isLOF: true }
        ];
        
        const matchedFunds = commonLOFs.filter(fund => 
            fund.code.includes(keyword) || 
            fund.name.includes(keyword) ||
            fund.code === keyword
        );
        
        if (matchedFunds.length > 0) {
            return res.json({
                success: true,
                data: matchedFunds,
                source: 'fallback',
                message: `找到 ${matchedFunds.length} 个常见LOF基金`
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
        
        // API失败，使用常见LOF基金
        const commonLOFs = [
            { code: '162411', name: '华宝油气(LOF)', type: 'LOF', isLOF: true },
            { code: '161725', name: '招商中证白酒指数(LOF)A', type: 'LOF', isLOF: true }
        ];
        
        const matchedFunds = commonLOFs.filter(fund => 
            fund.code.includes(keyword) || 
            fund.name.includes(keyword)
        );
        
        res.json({
            success: true,
            data: matchedFunds,
            source: 'error_fallback',
            message: matchedFunds.length > 0 ? 
                `搜索API失败，找到 ${matchedFunds.length} 个常见LOF基金` : 
                '搜索服务暂时不可用',
            error: error.message
        });
    }
});

// 2. 获取基金详情 - 真实数据 + 缓存兜底
app.get('/api/fund/:code', async (req, res) => {
    const { code } = req.params;
    const { forceCache } = req.query; // 可选参数：强制使用缓存
    
    // 如果强制使用缓存
    if (forceCache === 'true') {
        return getCachedFundData(code, res);
    }
    
    // 首先尝试实时API
    try {
        console.log(`尝试实时API获取基金数据: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 10000  // 10秒超时
        });
        
        const $ = cheerio.load(response.data);
        
        // 提取基金名称
        const fundName = $('.fundDetail-tit').text().trim() || `基金 ${code}`;
        
        // 提取净值数据
        const netValue = $('.dataItem01 .dataNums').first().text().trim() || '--';
        const dailyChange = $('.dataItem01 .dataNums').eq(1).text().trim() || '--';
        
        // 提取累计净值
        const totalValue = $('.dataItem02 .dataNums').first().text().trim() || '--';
        
        // 提取基金类型
        const typeText = $('.infoOfFund td').first().text();
        const fundType = typeText.split('：')[1]?.split('|')[0]?.trim() || '未知';
        
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
        
        // 提取更多信息
        let marketPrice = '--';
        let premiumRate = '--';
        let marketPriceSource = 'akshare';
        
        // 方法1：使用AkShare获取场内价格（优先）
        try {
            console.log(`尝试从AkShare获取场内价格: ${code}`);
            
            const { execSync } = require('child_process');
            const pythonScript = __dirname + '/akshare_fetcher_simple.py';
            
            // 调用Python脚本
            const result = execSync(`python3 "${pythonScript}" "${code}"`, {
                encoding: 'utf-8',
                timeout: 10000  // 10秒超时
            });
            
            const akData = JSON.parse(result);
            
            if (akData.success && akData.data && akData.data.price) {
                marketPrice = akData.data.price.toFixed(4);
                marketPriceSource = akData.data.source || 'akshare';
                console.log(`AkShare获取成功: ${marketPrice} (来源: ${marketPriceSource})`);
                
                // 计算折溢价率
                const netValueNum = parseFloat(netValue.split('-')[0] || netValue);
                if (netValueNum && netValueNum > 0) {
                    const premium = ((parseFloat(marketPrice) - netValueNum) / netValueNum * 100).toFixed(2);
                    premiumRate = `${premium}%`;
                }
            } else {
                console.log(`AkShare获取失败: ${akData.error || '未知错误'}`);
            }
        } catch (akError) {
            console.log(`AkShare接口失败: ${akError.message}`);
        }
        
        // 方法2：如果AkShare失败，尝试腾讯财经
        if (marketPrice === '--') {
            try {
                console.log(`尝试从腾讯财经获取场内价格: ${code}`);
                
                const qqCode = code.startsWith('50') || code.startsWith('51') ? `sh${code}` : `sz${code}`;
                const qqResponse = await axios.get(`https://qt.gtimg.cn/q=${qqCode}`, {
                    timeout: 5000,
                    headers: {
                        'Referer': 'https://gu.qq.com',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (qqResponse.data && qqResponse.data.includes('~')) {
                    const dataMatch = qqResponse.data.match(/="([^"]+)"/);
                    if (dataMatch && dataMatch[1]) {
                        const fields = dataMatch[1].split('~');
                        if (fields.length >= 4) {
                            const currentPrice = fields[3];
                            if (currentPrice && currentPrice !== '0.000') {
                                marketPrice = parseFloat(currentPrice).toFixed(4);
                                marketPriceSource = 'qq_realtime';
                                console.log(`腾讯财经获取成功: ${marketPrice}`);
                                
                                // 计算折溢价率
                                const netValueNum = parseFloat(netValue.split('-')[0] || netValue);
                                if (netValueNum && netValueNum > 0) {
                                    const premium = ((parseFloat(marketPrice) - netValueNum) / netValueNum * 100).toFixed(2);
                                    premiumRate = `${premium}%`;
                                }
                            }
                        }
                    }
                }
            } catch (qqError) {
                console.log(`腾讯财经接口失败: ${qqError.message}`);
            }
        }
        
        // 方法3：如果都失败，使用场外净值作为占位符
        if (marketPrice === '--') {
            marketPrice = netValue.split('-')[0] || netValue;
            premiumRate = '--';
            marketPriceSource = 'estimated';
        }
        
        // 检查限购信息
        let purchaseLimit = '无限制';
        const limitMatch = response.data.match(/单日累计购买上限([0-9,.]+)元/);
        if (limitMatch && limitMatch[1]) {
            purchaseLimit = `${limitMatch[1]}元/天`;
            if (subscriptionStatus === '开放申购') {
                subscriptionStatus = `限大额 (${purchaseLimit})`;
            }
        }
        
        // 检查是否为LOF基金
        const isLOF = fundName.includes('LOF') || fundName.includes('lof') || 
                     response.data.includes('LOF') || fundType.includes('LOF');
        
        // 使用自动获取的场内价格
        const finalMarketPrice = marketPrice;
        const finalPremiumRate = premiumRate;
        const marketPriceSourceValue = marketPriceSource;
        const marketPriceUpdateTime = new Date().toLocaleString('zh-CN');
        
        // 处理基金信息
        processFundInfo();
        
        function processFundInfo() {
            const fundInfo = {
                code: code,
                name: fundName,
                // 场外净值（基金净值）
                netValue: netValue,
                dailyChange: dailyChange,
                totalValue: totalValue,
                // 场内价格（交易所价格）
                marketPrice: finalMarketPrice,
                premiumRate: finalPremiumRate,
                // 基金信息
                fundType: fundType,
                isLOF: isLOF,
                subscriptionStatus: subscriptionStatus,
                purchaseLimit: purchaseLimit,
                // 元数据
                updateTime: new Date().toLocaleString('zh-CN'),
                dataTimestamp: Date.now(),
                source: 'real',
                url: fundUrl,
                dataFreshness: '实时数据',
                marketPriceSource: marketPriceSourceValue,
                marketPriceUpdateTime: marketPriceUpdateTime
            };
            
            // 保存到主数据库
            db.run(
                'INSERT OR REPLACE INTO funds (fund_code, fund_name) VALUES (?, ?)',
                [code, fundInfo.name]
            );
            
            // 保存到缓存数据库（保留手动更新标记）
            db.run(
                `INSERT OR REPLACE INTO fund_cache 
                (fund_code, fund_name, net_value, daily_change, total_value, fund_type, subscription_status, cache_time, source, raw_data) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    code, fundInfo.name, netValue, dailyChange, totalValue, 
                    fundType, subscriptionStatus, new Date().toISOString(), 
                    'real', JSON.stringify(fundInfo)
                ]
            );
            
            console.log(`实时API成功，已缓存数据: ${code}`);
            
            res.json({
                success: true,
                data: fundInfo,
                message: '实时数据获取成功',
                source: 'real',
                cacheStatus: '已缓存'
            });
        }
        
        // 保存到主数据库
        db.run(
            'INSERT OR REPLACE INTO funds (fund_code, fund_name) VALUES (?, ?)',
            [code, fundInfo.name]
        );
        
        // 保存到缓存数据库
        db.run(
            `INSERT OR REPLACE INTO fund_cache 
            (fund_code, fund_name, net_value, daily_change, total_value, fund_type, subscription_status, cache_time, source, raw_data) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code, fundInfo.name, netValue, dailyChange, totalValue, 
                fundType, subscriptionStatus, new Date().toISOString(), 
                'real', JSON.stringify(fundInfo)
            ]
        );
        
        console.log(`实时API成功，已缓存数据: ${code}`);
        
        res.json({
            success: true,
            data: fundInfo,
            message: '实时数据获取成功',
            source: 'real',
            cacheStatus: '已缓存'
        });
        
    } catch (error) {
        console.error(`实时API失败 (${code}):`, error.message);
        
        // 实时API失败，尝试从缓存获取
        console.log(`尝试从缓存获取数据: ${code}`);
        getCachedFundData(code, res);
    }
});

// 获取缓存数据的函数
function getCachedFundData(code, res) {
    db.get(
        'SELECT * FROM fund_cache WHERE fund_code = ? ORDER BY cache_time DESC LIMIT 1',
        [code],
        (err, row) => {
            if (err) {
                console.error('查询缓存失败:', err.message);
                return res.status(500).json({
                    success: false,
                    error: '缓存查询失败',
                    message: err.message
                });
            }
            
            if (row) {
                // 计算缓存时间差
                const cacheTime = new Date(row.cache_time);
                const now = new Date();
                const diffHours = Math.floor((now - cacheTime) / (1000 * 60 * 60));
                const diffMinutes = Math.floor((now - cacheTime) / (1000 * 60));
                
                let freshness = '实时数据';
                if (diffHours > 0) {
                    freshness = `${diffHours}小时前缓存`;
                } else if (diffMinutes > 0) {
                    freshness = `${diffMinutes}分钟前缓存`;
                } else {
                    freshness = '刚刚缓存';
                }
                
                // 尝试从raw_data中提取手动更新的场内价格
                let marketPrice = row.net_value || '--';
                let premiumRate = '--';
                let marketPriceSource = 'cache';
                let marketPriceUpdateTime = row.cache_time;
                
                try {
                    if (row.raw_data) {
                        const rawData = JSON.parse(row.raw_data);
                        if (rawData.marketPrice && rawData.marketPrice !== '--') {
                            marketPrice = rawData.marketPrice;
                            premiumRate = rawData.premiumRate || '--';
                            marketPriceSource = rawData.marketPriceSource || 'manual_update';
                            marketPriceUpdateTime = rawData.marketPriceUpdateTime || row.cache_time;
                        }
                    }
                } catch (e) {
                    console.log('解析raw_data失败:', e.message);
                }
                
                const cachedInfo = {
                    code: row.fund_code,
                    name: row.fund_name,
                    netValue: row.net_value || '--',
                    dailyChange: row.daily_change || '--',
                    totalValue: row.total_value || '--',
                    marketPrice: marketPrice,
                    premiumRate: premiumRate,
                    fundType: row.fund_type || '未知',
                    subscriptionStatus: row.subscription_status || '未知',
                    updateTime: new Date(row.cache_time).toLocaleString('zh-CN'),
                    cacheTime: row.cache_time,
                    dataTimestamp: new Date(row.cache_time).getTime(),
                    source: 'cache',
                    dataFreshness: freshness,
                    marketPriceSource: marketPriceSource,
                    marketPriceUpdateTime: marketPriceUpdateTime,
                    note: '实时API失败，使用缓存数据'
                };
                
                console.log(`使用缓存数据: ${code} (${freshness})`);
                
                res.json({
                    success: true,
                    data: cachedInfo,
                    message: `缓存数据 (${freshness})`,
                    source: 'cache',
                    cacheAge: {
                        hours: diffHours,
                        minutes: diffMinutes % 60
                    }
                });
            } else {
                // 没有缓存数据
                res.status(404).json({
                    success: false,
                    error: '数据不存在',
                    message: `基金 ${code} 无实时数据且无缓存`,
                    suggestion: '请先确保基金代码正确，或稍后重试'
                });
            }
        }
    );
}

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

// 8. 缓存管理API
app.get('/api/cache/status', (req, res) => {
    db.all(
        'SELECT fund_code, fund_name, cache_time, source FROM fund_cache ORDER BY cache_time DESC LIMIT 10',
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '获取缓存状态失败' });
            }
            
            // 统计信息
            db.get('SELECT COUNT(*) as total FROM fund_cache', (err, countRow) => {
                if (err) {
                    return res.status(500).json({ error: '获取缓存统计失败' });
                }
                
                res.json({
                    success: true,
                    data: {
                        cacheCount: countRow.total,
                        cacheList: rows.map(row => ({
                            code: row.fund_code,
                            name: row.fund_name,
                            cacheTime: row.cache_time,
                            source: row.source,
                            timeAgo: getTimeAgo(new Date(row.cache_time))
                        })),
                        serverTime: new Date().toLocaleString('zh-CN')
                    }
                });
            });
        }
    );
});

// 9. 清除缓存
app.delete('/api/cache/:code', (req, res) => {
    const { code } = req.params;
    
    db.run(
        'DELETE FROM fund_cache WHERE fund_code = ?',
        [code],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '清除缓存失败' });
            }
            res.json({ 
                success: true, 
                message: '缓存清除成功',
                changes: this.changes
            });
        }
    );
});

// 10. 强制更新缓存（重新从API获取）
app.post('/api/cache/refresh/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        console.log(`强制刷新缓存: ${code}`);
        
        const fundUrl = `https://fund.eastmoney.com/${code}.html`;
        const response = await axios.get(fundUrl, {
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // 提取数据（与主逻辑相同）
        const fundName = $('.fundDetail-tit').text().trim() || `基金 ${code}`;
        const netValue = $('.dataItem01 .dataNums').first().text().trim() || '--';
        const dailyChange = $('.dataItem01 .dataNums').eq(1).text().trim() || '--';
        const totalValue = $('.dataItem02 .dataNums').first().text().trim() || '--';
        
        const typeText = $('.infoOfFund td').first().text();
        const fundType = typeText.split('：')[1]?.split('|')[0]?.trim() || '未知';
        
        let subscriptionStatus = '开放申购';
        const statusText = $('.static').text();
        if (statusText.includes('暂停申购')) {
            subscriptionStatus = '暂停申购';
        } else if (statusText.includes('限制申购')) {
            subscriptionStatus = '限制申购';
        }
        
        // 更新缓存
        db.run(
            `INSERT OR REPLACE INTO fund_cache 
            (fund_code, fund_name, net_value, daily_change, total_value, fund_type, subscription_status, cache_time, source) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code, fundName, netValue, dailyChange, totalValue, 
                fundType, subscriptionStatus, new Date().toISOString(), 'real_refresh'
            ]
        );
        
        res.json({
            success: true,
            message: '缓存强制刷新成功',
            data: {
                code: code,
                name: fundName,
                netValue: netValue,
                updateTime: new Date().toLocaleString('zh-CN')
            }
        });
        
    } catch (error) {
        console.error('强制刷新缓存失败:', error.message);
        res.status(500).json({
            success: false,
            error: '强制刷新失败',
            message: error.message
        });
    }
});

// 辅助函数：计算时间差
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
        return `${diffDays}天前`;
    } else if (diffHours > 0) {
        return `${diffHours}小时前`;
    } else if (diffMins > 0) {
        return `${diffMins}分钟前`;
    } else {
        return '刚刚';
    }
}

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
        console.log(`\n🎉 LOF基金查询系统已启动（固定端口版）`);
        console.log(`\n🔐 登录信息:`);
        console.log(`   用户名: admin`);
        console.log(`   密码: Admin123456`);
        console.log(`\n🌐 固定访问地址:`);
        console.log(`   HTTPS: https://43.161.221.10:${HTTPS_PORT}`);
        console.log(`   HTTP:  http://43.161.221.10:${HTTP_PORT}`);
        console.log(`\n📊 数据模式:`);
        console.log(`   🚀 真实API: 东方财富实时数据`);
        console.log(`   🔧 稳定端口: ${HTTP_PORT}/${HTTPS_PORT} 固定不变`);
        console.log(`\n🚀 测试命令:`);
        console.log(`   搜索162411: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/search?keyword=162411"`);
        console.log(`   获取详情: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/fund/162411"`);
        console.log(`   API测试: curl -k --tlsv1.2 -u "admin:Admin123456" "https://43.161.221.10:${HTTPS_PORT}/api/test"`);
        console.log(`\n💡 提示: 现在使用固定端口，无需再更改端口！`);
    });
} catch (error) {
    console.log('⚠️ HTTPS启动失败:', error.message);
    console.log('📋 使用HTTP模式运行中...');
}