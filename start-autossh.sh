#!/bin/bash
SERVER="43.161.221.10"
LOCAL_HTTP_PORT=3001
LOCAL_HTTPS_PORT=3444
REMOTE_HTTP_PORT=3001
REMOTE_HTTPS_PORT=3444

# 检查autossh是否安装
if ! command -v autossh &> /dev/null; then
    echo "安装autossh..."
    # macOS
    brew install autossh 2>/dev/null || true
    # Ubuntu/Debian
    sudo apt install autossh 2>/dev/null || true
    # CentOS/RHEL
    sudo yum install autossh 2>/dev/null || true
fi

echo "启动autossh隧道（自动重连）..."
autossh -M 0 \
  -o "ServerAliveInterval 60" \
  -o "ServerAliveCountMax 3" \
  -L $LOCAL_HTTP_PORT:localhost:$REMOTE_HTTP_PORT \
  -L $LOCAL_HTTPS_PORT:localhost:$REMOTE_HTTPS_PORT \
  root@$SERVER -N &

if [ $? -eq 0 ]; then
    echo "✅ autossh隧道启动成功！"
    echo "隧道PID: $!"
    echo $! > tunnel.pid
    echo ""
    echo "🌐 访问地址："
    echo "  HTTP: http://localhost:$LOCAL_HTTP_PORT"
    echo "  HTTPS: https://localhost:$LOCAL_HTTPS_PORT"
else
    echo "❌ autossh隧道启动失败"
fi
