#!/bin/bash

echo "========================================="
echo "   SSH隧道访问方案"
echo "========================================="

SERVER="43.161.221.10"
USER="admin"
PASS="9moFkjbVBTrJkd50"

echo ""
echo "📋 方案1: 单个SSH隧道"
echo "----------------------------------------"
echo "在你的本地电脑执行："
echo ""
echo "# HTTP隧道 (端口3001)"
echo "ssh -L 3001:localhost:3001 root@$SERVER"
echo ""
echo "# HTTPS隧道 (端口3444)"
echo "ssh -L 3444:localhost:3444 root@$SERVER"
echo ""
echo "然后本地访问："
echo "  HTTP: http://localhost:3001"
echo "  HTTPS: https://localhost:3444"
echo "  用户名: $USER"
echo "  密码: $PASS"

echo ""
echo "📋 方案2: 双端口隧道"
echo "----------------------------------------"
echo "# 同时映射两个端口"
echo "ssh -L 3001:localhost:3001 -L 3444:localhost:3444 root@$SERVER"
echo ""
echo "# 保持隧道运行（后台）"
echo "ssh -f -N -L 3001:localhost:3001 -L 3444:localhost:3444 root@$SERVER"

echo ""
echo "📋 方案3: 自动隧道脚本"
echo "----------------------------------------"
cat > start-tunnel.sh << 'EOF'
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
EOF

chmod +x start-tunnel.sh
echo "✅ 已创建自动隧道脚本: ./start-tunnel.sh"

echo ""
echo "📋 方案4: 使用autossh（自动重连）"
echo "----------------------------------------"
cat > start-autossh.sh << 'EOF'
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
EOF

chmod +x start-autossh.sh
echo "✅ 已创建autossh脚本: ./start-autossh.sh"

echo ""
echo "========================================="
echo "          立即使用"
echo "========================================="
echo ""
echo "1. 下载脚本到本地："
echo "   scp root@$SERVER:/root/.openclaw/workspace/lof-fund-tracker/start-tunnel.sh ."
echo ""
echo "2. 运行隧道："
echo "   chmod +x start-tunnel.sh"
echo "   ./start-tunnel.sh"
echo ""
echo "3. 访问网站："
echo "   打开浏览器 → http://localhost:3001"
echo "   或 https://localhost:3444"
echo ""
echo "4. 登录："
echo "   用户名: admin"
echo "   密码: 9moFkjbVBTrJkd50"
echo ""
echo "========================================="
echo "   SSH隧道是最可靠的访问方式！"
echo "========================================="