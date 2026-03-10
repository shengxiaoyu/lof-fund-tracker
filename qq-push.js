#!/usr/bin/env node

/**
 * QQ推送集成脚本
 * 用于将监控结果推送到QQ
 */

const { monitorPremium } = require('./premium-monitor.js');

// 你的QQ号
const TARGET_QQ = '15DD74BE750356CD96E3D1AD85FF68D5';

/**
 * 生成推送消息（简化版）
 */
function generatePushMessage(alerts) {
    if (alerts.length === 0) {
        return null;
    }
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN');
    const timeStr = now.toLocaleTimeString('zh-CN');
    
    let message = `📊 LOF基金溢价监控报告\n`;
    message += `📅 日期：${dateStr}\n`;
    message += `⏰ 时间：${timeStr}\n`;
    message += `📈 检测结果：发现 ${alerts.length} 个高溢价基金\n\n`;
    
    alerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.fund.name} (${alert.fund.code})\n`;
        message += `   溢价率：${alert.premiumRate.toFixed(2)}%\n`;
        message += `   场内价格：${alert.data.market.price}\n`;
        message += `   官方净值：${alert.data.official.netValue}\n\n`;
    });
    
    message += `💡 投资提示：溢价率超过3%可能表示场内价格偏高\n`;
    message += `建议关注折价机会或等待价格回归合理区间\n\n`;
    message += `#LOF监控 #溢价提醒`;
    
    return message;
}

/**
 * 通过OpenClaw发送QQ消息
 */
async function sendQQMessage(message) {
    if (!message) {
        console.log('没有消息需要发送');
        return false;
    }
    
    console.log('准备发送QQ消息：');
    console.log('='.repeat(50));
    console.log(message);
    console.log('='.repeat(50));
    
    // 这里应该调用OpenClaw的message工具
    // 实际代码需要根据OpenClaw的API进行调整
    
    console.log('💡 提示：需要配置OpenClaw的QQ推送功能');
    console.log('📱 消息内容已准备好，可以手动复制发送');
    
    return true;
}

/**
 * 主推送函数
 */
async function main() {
    console.log('🚀 启动QQ溢价监控推送');
    console.log('='.repeat(50));
    
    try {
        // 1. 执行监控
        const alerts = await monitorPremium();
        
        // 2. 生成推送消息
        const pushMessage = generatePushMessage(alerts);
        
        if (pushMessage) {
            // 3. 发送QQ消息
            await sendQQMessage(pushMessage);
            
            console.log(`\n✅ 推送任务完成`);
            console.log(`📤 已准备推送 ${alerts.length} 个提醒`);
            
            // 显示实际推送内容
            console.log('\n📋 推送内容预览：');
            console.log(pushMessage);
            
        } else {
            console.log('✅ 所有基金溢价率正常，无需推送');
        }
        
    } catch (error) {
        console.error(`推送过程出错: ${error.message}`);
    }
}

// 执行推送
if (require.main === module) {
    main();
}

module.exports = {
    generatePushMessage,
    sendQQMessage
};