#!/bin/bash
SERVER="43.161.221.10"
LOCAL_HTTP_PORT=3001
LOCAL_HTTPS_PORT=3444
REMOTE_HTTP_PORT=3001
REMOTE_HTTPS_PORT=3444

echo "启动SSH隧道..."
echo "HTTP: localhost:$LOCAL_HTTP_PORT → $SERVER:$REMOTE_HTTP_PORT"
echo "HTTPS: localhost:$LOCAL_HTTPS_PORT → $SERVER:$REMOTE_HTTPS_PORT"

# 启动隧道
ssh -f -N \
  -L $LOCAL_HTTP_PORT:localhost:$REMOTE_HTTP_PORT \
  -L $LOCAL_HTTPS_PORT:localhost:$REMOTE_HTTPS_PORT \
  root@$SERVER

if [ $? -eq 0 ]; then
    echo "✅ 隧道启动成功！"
    echo ""
    echo "🌐 访问地址："
    echo "  HTTP: http://localhost:$LOCAL_HTTP_PORT"
    echo "  HTTPS: https://localhost:$LOCAL_HTTPS_PORT"
    echo ""
    echo "🔑 登录信息："
    echo "  用户名: admin"
    echo "  密码: 9moFkjbVBTrJkd50"
    echo ""
    echo "🛑 停止隧道："
    echo "  pkill -f \"ssh.*$SERVER\""
else
    echo "❌ 隧道启动失败"
fi
