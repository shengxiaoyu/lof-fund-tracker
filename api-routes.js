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

