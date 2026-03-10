#!/bin/bash

# LOF基金服务器Cron配置脚本
# 功能：配置定时监控任务

echo "=== LOF基金服务器Cron配置 ==="
echo ""

# 脚本路径
SCRIPT_PATH="/root/.openclaw/workspace/lof-fund-tracker/server-monitor.sh"
CRON_FILE="/etc/cron.d/lof-fund-monitor"

# 检查脚本是否存在
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ 错误：监控脚本不存在: $SCRIPT_PATH"
    exit 1
fi

echo "✅ 监控脚本位置: $SCRIPT_PATH"

# 创建cron配置文件
echo "创建cron配置文件: $CRON_FILE"
cat > "$CRON_FILE" << EOF
# LOF基金查询服务器监控任务
# 每5分钟检查一次服务器状态

# 分钟 小时 日 月 周 用户 命令
*/5 * * * * root /bin/bash $SCRIPT_PATH monitor >/dev/null 2>&1

# 每天凌晨3点清理日志
0 3 * * * root /bin/bash $SCRIPT_PATH log-cleanup >/dev/null 2>&1

# 每天凌晨4点重启服务器（可选，保持新鲜）
# 0 4 * * * root /bin/bash $SCRIPT_PATH stop && sleep 5 && /bin/bash $SCRIPT_PATH start >/dev/null 2>&1
EOF

echo "✅ Cron配置文件已创建"

# 设置权限
chmod 644 "$CRON_FILE"
echo "✅ 文件权限已设置"

# 重启cron服务
if systemctl restart crond 2>/dev/null || service cron restart 2>/dev/null; then
    echo "✅ Cron服务已重启"
else
    echo "⚠️  无法重启cron服务，请手动重启"
fi

echo ""
echo "=== 配置完成 ==="
echo ""
echo "监控任务已配置："
echo "1. 每5分钟检查服务器状态"
echo "2. 每天凌晨3点清理日志"
echo ""
echo "手动测试命令："
echo "  $SCRIPT_PATH status    # 查看服务器状态"
echo "  $SCRIPT_PATH monitor   # 手动运行监控"
echo "  $SCRIPT_PATH log       # 查看监控日志"
echo ""
echo "Cron日志位置："
echo "  /var/log/cron (系统cron日志)"
echo "  $SCRIPT_PATH.log (监控脚本日志)"