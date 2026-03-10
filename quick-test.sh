#!/bin/bash

echo "🔧 快速兼容性测试"

SERVER="43.161.221.10"
USER="admin"
PASS="9moFkjbVBTrJkd50"

echo ""
echo "1. 测试HTTPS (TLS 1.2):"
curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:3443/api/stats" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "失败"

echo ""
echo "2. 测试HTTPS (默认):"
curl -k -u "$USER:$PASS" "https://$SERVER:3443/api/stats" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "失败"

echo ""
echo "3. 测试HTTP:"
curl -u "$USER:$PASS" "http://$SERVER:3000/api/stats" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "失败"

echo ""
echo "4. 测试基金搜索:"
curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:3443/api/search?keyword=白酒" 2>/dev/null | python3 -m json.tool 2>/dev/null | head -20 || echo "失败"

echo ""
echo "✅ 测试完成！"