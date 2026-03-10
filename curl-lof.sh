#!/bin/bash
# LOF基金查询系统快捷访问
SERVER="43.161.221.10"
PORT="3443"
USER="admin"
PASS="9moFkjbVBTrJkd50"

# 尝试不同方法
if curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:$PORT/api/stats" 2>/dev/null | grep -q "success"; then
    echo "使用TLS 1.2连接..."
    curl -k --tlsv1.2 -u "$USER:$PASS" "https://$SERVER:$PORT/$@"
elif curl -k -u "$USER:$PASS" "https://$SERVER:$PORT/api/stats" 2>/dev/null | grep -q "success"; then
    echo "使用默认TLS连接..."
    curl -k -u "$USER:$PASS" "https://$SERVER:$PORT/$@"
else
    echo "使用HTTP连接..."
    curl -u "$USER:$PASS" "http://$SERVER:3000/$@"
fi
