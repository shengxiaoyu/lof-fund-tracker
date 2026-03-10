#!/usr/bin/env node

/**
 * LOF基金溢价监控脚本
 * 功能：每日10点检查关注基金溢价率，超过3%时通过QQ推送提醒
 * 运行方式：cron定时任务
 */

const axios = require('axios');
const https = require('https');

// 配置
const SERVER_URL = 'http://localhost:3001'; // 使用HTTP端口，避免SSL问题
const THRESHOLD = 3.0; // 溢价率阈值（%）
const TARGET_QQ = '15DD74BE750356CD96E3D1AD85FF68D5'; // 你的QQ号

// 模拟的关注列表（实际应该从数据库或localStorage读取）
// 注意：你需要先在完整版页面添加关注这些基金
const DEFAULT_WATCHLIST = [
    { code: '162411', name: '华宝油气(LOF)' },
    { code: '161725', name: '招商中证白酒指数(LOF)A' },
    { code: '161726', name: '招商国证生物医药指数(LOF)A' },
    { code: '501018', name: '南方原油(LOF)' }
];

/**
 * 获取基金数据
 */
async function getFundData(code) {
    try {
        const response = await axios.get(`${SERVER_URL}/api/fund/${code}`, {
            timeout: 10000
        });
        
        if (response.data.success) {
            return response.data.data;
        } else {
            console.log(`基金 ${code} 数据获取失败: ${response.data.message}`);
            return null;
        }
    } catch (error) {
        console.log(`基金 ${code} 请求失败: ${error.message}`);
        return null;
    }
}

/**
 * 解析溢价率字符串
 * 例如："4.94%" -> 4.94
 */
function parsePremiumRate(premiumRateStr) {
    if (!premiumRateStr || premiumRateStr === '--') {
        return null;
    }
    
    try {
        // 移除百分号，转换为数字
        const rate = parseFloat(premiumRateStr.replace('%', ''));
        return isNaN(rate) ? null : rate;
    } catch (error) {
        console.log(`解析溢价率失败: ${premiumRateStr}`, error.message);
        return null;
    }
}

/**
 * 生成推送消息
 */
function generateAlertMessage(fund, premiumRate) {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN');
    
    return `🚨 溢价提醒 🚨

📊 基金名称：${fund.name} (${fund.code})
💰 当前溢价率：${premiumRate.toFixed(2)}%
📈 已超过设定阈值：${THRESHOLD}%

⏰ 检测时间：${timeStr}

💡 投资提示：
LOF基金溢价过高时，场内价格可能虚高
建议关注折价机会或等待价格回归

#LOF监控 #溢价提醒`;
}

/**
 * 主监控函数
 */
async function monitorPremium() {
    console.log(`⏰ ${new Date().toLocaleString('zh-CN')} - 开始溢价监控检查`);
    console.log(`📊 监控阈值：${THRESHOLD}%`);
    console.log(`📋 关注基金数：${DEFAULT_WATCHLIST.length}`);
    
    const alerts = [];
    
    // 逐个检查关注基金
    for (const fund of DEFAULT_WATCHLIST) {
        console.log(`\n🔍 检查基金：${fund.name} (${fund.code})`);
        
        try {
            const fundData = await getFundData(fund.code);
            
            if (!fundData) {
                console.log(`  ❌ 数据获取失败，跳过`);
                continue;
            }
            
            // 获取溢价率
            const premiumRateStr = fundData.calculations?.premiumRate;
            const premiumRate = parsePremiumRate(premiumRateStr);
            
            if (premiumRate === null) {
                console.log(`  ⚠️  溢价率数据无效: ${premiumRateStr}`);
                continue;
            }
            
            console.log(`  📊 当前溢价率: ${premiumRate.toFixed(2)}%`);
            
            // 检查是否超过阈值
            if (premiumRate > THRESHOLD) {
                console.log(`  🚨 发现高溢价！超过阈值 ${THRESHOLD}%`);
                
                const alertMessage = generateAlertMessage(fund, premiumRate);
                alerts.push({
                    fund: fund,
                    premiumRate: premiumRate,
                    message: alertMessage,
                    data: fundData
                });
            } else {
                console.log(`  ✅ 溢价率正常`);
            }
            
            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.log(`  ❌ 检查过程出错: ${error.message}`);
        }
    }
    
    // 输出监控结果
    console.log(`\n📊 监控完成`);
    console.log(`📈 检查基金数: ${DEFAULT_WATCHLIST.length}`);
    console.log(`🚨 发现高溢价基金数: ${alerts.length}`);
    
    if (alerts.length > 0) {
        console.log(`\n📢 需要推送的提醒:`);
        alerts.forEach((alert, index) => {
            console.log(`\n${index + 1}. ${alert.fund.name} (${alert.fund.code})`);
            console.log(`   溢价率: ${alert.premiumRate.toFixed(2)}%`);
        });
        
        // 这里应该调用QQ推送API
        // 实际推送需要集成QQ Bot的推送功能
        console.log(`\n💡 提示：需要配置QQ Bot推送功能`);
        
    } else {
        console.log(`✅ 所有基金溢价率正常，无需推送`);
    }
    
    return alerts;
}

/**
 * 启动监控
 */
async function main() {
    try {
        console.log('🎯 LOF基金溢价监控系统');
        console.log('='.repeat(50));
        
        const alerts = await monitorPremium();
        
        console.log(`\n⏰ ${new Date().toLocaleString('zh-CN')} - 监控任务完成`);
        
        // 如果有高溢价基金，这里可以触发推送
        if (alerts.length > 0) {
            // 实际推送逻辑
            console.log(`\n🚨 检测到 ${alerts.length} 个高溢价基金，准备推送提醒...`);
            
            // 这里应该调用QQ推送API
            // 例如：通过OpenClaw的message工具发送
        }
        
    } catch (error) {
        console.error(`监控系统出错: ${error.message}`);
        process.exit(1);
    }
}

// 如果是直接运行，执行监控
if (require.main === module) {
    main();
}

module.exports = {
    monitorPremium,
    parsePremiumRate,
    generateAlertMessage
};