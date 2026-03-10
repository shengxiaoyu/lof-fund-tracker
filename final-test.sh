#!/bin/bash

echo "========================================="
echo "   终极兼容性测试 - TLS 1.2强制模式"
echo "========================================="

SERVER="43.161.221.10"
USER="admin"
PASS="9moFkjbVBTrJkd50"

echo ""
echo "📊 服务器状态:"
echo "   HTTP端口: 3001"
echo "   HTTPS端口: 3444"
echo "   TLS版本: 强制TLS 1.2"
echo "   公网IP: $SERVER"

echo ""
echo "🔧 测试1: HTTP连接 (端口3001)"
echo "----------------------------------------"
curl -s -u "$USER:$PASS" "http://$SERVER:3001/api/stats" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('✅ HTTP连接成功!')
    print(f'   状态: {data[\"success\"]}')
    print(f'   基金总数: {data[\"data\"][\"totalFunds\"]}')
    print(f'   最后更新: {data[\"data\"][\"lastUpdate\"]}')
except:
    print('❌ HTTP连接失败')
"

echo ""
echo "🔐 测试2: HTTPS连接 (端口3444, TLS 1.2)"
echo "----------------------------------------"
curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:3444/api/stats" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('✅ HTTPS TLS 1.2连接成功!')
    print(f'   状态: {data[\"success\"]}')
    print(f'   消息: {data[\"data\"][\"message\"]}')
except Exception as e:
    print('❌ HTTPS TLS 1.2连接失败')
    print(f'   错误: {e}')
"

echo ""
echo "🔍 测试3: 基金搜索功能"
echo "----------------------------------------"
curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:3444/api/search?keyword=白酒" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data['success']:
        print(f'✅ 搜索成功! 找到 {len(data[\"data\"])} 个基金')
        for fund in data['data']:
            print(f'   {fund[\"code\"]} - {fund[\"name\"]}')
    else:
        print('❌ 搜索失败')
except:
    print('❌ 搜索测试失败')
"

echo ""
echo "📋 测试4: 获取基金详情"
echo "----------------------------------------"
curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:3444/api/fund/161725" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data['success']:
        fund = data['data']
        print('✅ 基金详情获取成功!')
        print(f'   基金代码: {fund[\"code\"]}')
        print(f'   基金名称: {fund[\"name\"]}')
        print(f'   基金净值: {fund[\"netValue\"]}')
        print(f'   场内现价: {fund[\"marketPrice\"]}')
        print(f'   折溢价率: {fund[\"premiumRate\"]}')
        print(f'   申购状态: {fund[\"subscriptionStatus\"]}')
    else:
        print('❌ 基金详情获取失败')
except:
    print('❌ 基金详情测试失败')
"

echo ""
echo "========================================="
echo "          访问方式总结"
echo "========================================="
echo ""
echo "🌐 浏览器访问:"
echo "   1. HTTPS (推荐): https://$SERVER:3444"
echo "   2. HTTP: http://$SERVER:3001"
echo ""
echo "🔑 登录信息:"
echo "   用户名: $USER"
echo "   密码: $PASS"
echo ""
echo "📱 命令行访问:"
echo "   # HTTPS (TLS 1.2)"
echo "   curl -k --tlsv1.2 -u \"$USER:$PASS\" \"https://$SERVER:3444/api/stats\""
echo ""
echo "   # HTTP"
echo "   curl -u \"$USER:$PASS\" \"http://$SERVER:3001/api/stats\""
echo ""
echo "⚠️  重要提醒:"
echo "   1. 首次访问会有SSL警告，点击'继续'即可"
echo "   2. 这是TLS 1.2强制模式，兼容旧客户端"
echo "   3. 密码已硬编码，请妥善保管"
echo ""
echo "========================================="
echo "   现在应该可以正常访问了！"
echo "========================================="