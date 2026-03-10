// API测试脚本
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
    console.log('🧪 开始测试LOF基金查询系统API...\n');
    
    try {
        // 1. 测试搜索功能
        console.log('1. 测试搜索功能...');
        const searchResponse = await axios.get(`${BASE_URL}/api/search`, {
            params: { keyword: '白酒' }
        });
        console.log('✅ 搜索成功');
        console.log(`   找到 ${searchResponse.data.data?.length || 0} 个结果`);
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
            console.log(`   第一个结果: ${searchResponse.data.data[0].code} - ${searchResponse.data.data[0].name}`);
        }
        console.log();
        
        // 2. 测试获取基金详情（使用一个已知的LOF基金）
        console.log('2. 测试获取基金详情...');
        const fundCode = '161725'; // 招商中证白酒指数(LOF)A
        const fundResponse = await axios.get(`${BASE_URL}/api/fund/${fundCode}`);
        console.log('✅ 获取基金详情成功');
        console.log(`   基金名称: ${fundResponse.data.data.name}`);
        console.log(`   基金代码: ${fundResponse.data.data.code}`);
        console.log(`   场内现价: ${fundResponse.data.data.marketPrice}`);
        console.log(`   基金净值: ${fundResponse.data.data.netValue}`);
        console.log(`   折溢价率: ${fundResponse.data.data.premiumRate}`);
        console.log(`   申购状态: ${fundResponse.data.data.subscriptionStatus}`);
        console.log();
        
        // 3. 测试添加基金到关注列表
        console.log('3. 测试添加基金到关注列表...');
        const addResponse = await axios.post(`${BASE_URL}/api/fund/add`, {
            code: fundCode,
            name: fundResponse.data.data.name
        });
        console.log('✅ 添加基金成功');
        console.log(`   基金ID: ${addResponse.data.fundId}`);
        console.log();
        
        // 4. 测试获取关注列表
        console.log('4. 测试获取关注列表...');
        const fundsResponse = await axios.get(`${BASE_URL}/api/funds`);
        console.log('✅ 获取关注列表成功');
        console.log(`   关注基金数量: ${fundsResponse.data.data.length}`);
        fundsResponse.data.data.forEach((fund, index) => {
            console.log(`   ${index + 1}. ${fund.fund_code} - ${fund.fund_name}`);
        });
        console.log();
        
        // 5. 测试获取统计数据
        console.log('5. 测试获取统计数据...');
        const statsResponse = await axios.get(`${BASE_URL}/api/stats`);
        console.log('✅ 获取统计数据成功');
        console.log(`   关注基金总数: ${statsResponse.data.data.totalFunds}`);
        console.log(`   今日更新数量: ${statsResponse.data.data.updatedToday}`);
        console.log(`   最后更新时间: ${statsResponse.data.data.lastUpdate}`);
        console.log();
        
        // 6. 测试批量更新
        console.log('6. 测试批量更新基金数据...');
        const updateResponse = await axios.get(`${BASE_URL}/api/funds/update`);
        console.log('✅ 批量更新成功');
        console.log(`   更新结果: ${updateResponse.data.message}`);
        console.log();
        
        // 7. 测试获取历史数据
        console.log('7. 测试获取基金历史数据...');
        const historyResponse = await axios.get(`${BASE_URL}/api/fund/${fundCode}/history`, {
            params: { limit: 5 }
        });
        console.log('✅ 获取历史数据成功');
        console.log(`   历史记录数量: ${historyResponse.data.data.length}`);
        if (historyResponse.data.data.length > 0) {
            const latest = historyResponse.data.data[0];
            console.log(`   最新记录:`);
            console.log(`     场内现价: ${latest.market_price}`);
            console.log(`     基金净值: ${latest.net_value}`);
            console.log(`     折溢价率: ${latest.premium_rate}`);
            console.log(`     更新时间: ${latest.update_time}`);
        }
        console.log();
        
        // 8. 测试删除基金（可选）
        console.log('8. 测试删除基金...');
        const deleteResponse = await axios.delete(`${BASE_URL}/api/fund/${fundCode}`);
        console.log('✅ 删除基金成功');
        console.log(`   删除结果: ${deleteResponse.data.message}`);
        
        console.log('\n🎉 所有API测试通过！');
        console.log('\n📋 系统功能总结:');
        console.log('   ✅ 基金搜索功能正常');
        console.log('   ✅ 基金详情获取正常');
        console.log('   ✅ 关注列表管理正常');
        console.log('   ✅ 数据统计功能正常');
        console.log('   ✅ 批量更新功能正常');
        console.log('   ✅ 历史数据查询正常');
        console.log('   ✅ 基金删除功能正常');
        console.log('\n🚀 系统已准备就绪，可以开始使用！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('   响应数据:', error.response.data);
            console.error('   状态码:', error.response.status);
        }
        process.exit(1);
    }
}

// 如果服务器未运行，先启动服务器
async function startServer() {
    console.log('🚀 正在启动服务器...');
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
        const server = spawn('node', ['server.js'], {
            stdio: 'pipe',
            detached: true
        });
        
        server.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            
            if (output.includes('服务器运行在')) {
                setTimeout(resolve, 2000); // 给服务器一点启动时间
                global.serverProcess = server;
            }
        });
        
        server.stderr.on('data', (data) => {
            console.error('服务器错误:', data.toString());
        });
        
        server.on('error', reject);
        
        // 10秒后超时
        setTimeout(() => reject(new Error('服务器启动超时')), 10000);
    });
}

// 主函数
async function main() {
    try {
        // 检查服务器是否已经在运行
        try {
            await axios.get(`${BASE_URL}/api/stats`, { timeout: 2000 });
            console.log('✅ 服务器已经在运行');
    } catch {
            console.log('🔄 服务器未运行，正在启动...');
            await startServer();
        }
        
        // 运行API测试
        await testAPI();
        
        // 清理
        if (global.serverProcess) {
            console.log('\n🛑 停止测试服务器...');
            process.kill(-global.serverProcess.pid);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出错:', error.message);
        process.exit(1);
    }
}

// 运行测试
if (require.main === module) {
    main();
}

module.exports = { testAPI };