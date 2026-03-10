#!/bin/bash

# LOF基金查询服务器监控脚本
# 功能：定时检查服务器状态，如果关闭则自动重启
# 运行方式：添加到cron定时任务

# 配置参数
SERVER_NAME="LOF基金查询系统"
SERVER_DIR="/root/.openclaw/workspace/lof-fund-tracker"
SERVER_SCRIPT="server-noauth.js"
LOG_FILE="$SERVER_DIR/server-monitor.log"
MAX_LOG_SIZE=10485760  # 10MB

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO") color=$GREEN ;;
        "WARN") color=$YELLOW ;;
        "ERROR") color=$RED ;;
        "DEBUG") color=$BLUE ;;
        *) color=$NC ;;
    esac
    
    echo -e "${color}[$timestamp] [$level] $message${NC}"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# 检查并清理日志文件
cleanup_log() {
    if [ -f "$LOG_FILE" ]; then
        local log_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)
        if [ "$log_size" -gt "$MAX_LOG_SIZE" ]; then
            log_message "INFO" "日志文件超过10MB，正在清理..."
            tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
            log_message "INFO" "日志文件已清理"
        fi
    fi
}

# 检查服务器状态
check_server_status() {
    # 方法1：检查进程是否存在
    local pid=$(pgrep -f "$SERVER_SCRIPT")
    if [ -n "$pid" ]; then
        log_message "DEBUG" "服务器进程存在，PID: $pid"
        return 0  # 进程存在
    fi
    
    # 方法2：检查端口是否监听
    if netstat -tlnp 2>/dev/null | grep -q ":3001\|:3444"; then
        log_message "DEBUG" "服务器端口正在监听"
        return 0  # 端口监听
    fi
    
    # 方法3：检查API响应
    if curl -s --tlsv1.2 -k "https://localhost:3444/api/status" >/dev/null 2>&1 || \
       curl -s "http://localhost:3001/api/status" >/dev/null 2>&1; then
        log_message "DEBUG" "服务器API响应正常"
        return 0  # API正常
    fi
    
    log_message "DEBUG" "服务器未运行"
    return 1  # 服务器未运行
}

# 启动服务器
start_server() {
    log_message "INFO" "正在启动 $SERVER_NAME..."
    
    # 切换到服务器目录
    cd "$SERVER_DIR" || {
        log_message "ERROR" "无法切换到目录: $SERVER_DIR"
        return 1
    }
    
    # 启动服务器（后台运行）
    nohup node "$SERVER_SCRIPT" > "$SERVER_DIR/server-output.log" 2>&1 &
    local server_pid=$!
    
    # 等待启动
    sleep 3
    
    # 检查是否启动成功
    if check_server_status; then
        log_message "INFO" "$SERVER_NAME 启动成功，PID: $server_pid"
        
        # 记录启动信息
        echo "=== 服务器启动信息 ===" >> "$LOG_FILE"
        echo "启动时间: $(date)" >> "$LOG_FILE"
        echo "进程PID: $server_pid" >> "$LOG_FILE"
        echo "工作目录: $(pwd)" >> "$LOG_FILE"
        echo "=====================" >> "$LOG_FILE"
        
        return 0
    else
        log_message "ERROR" "$SERVER_NAME 启动失败"
        
        # 查看启动日志
        if [ -f "$SERVER_DIR/server-output.log" ]; then
            log_message "DEBUG" "启动日志最后10行:"
            tail -10 "$SERVER_DIR/server-output.log" >> "$LOG_FILE"
        fi
        
        return 1
    fi
}

# 主监控函数
monitor_server() {
    log_message "INFO" "开始监控 $SERVER_NAME"
    
    # 清理日志
    cleanup_log
    
    # 检查服务器状态
    if check_server_status; then
        log_message "INFO" "$SERVER_NAME 运行正常"
    else
        log_message "WARN" "$SERVER_NAME 未运行，正在尝试重启..."
        
        # 尝试重启
        if start_server; then
            log_message "INFO" "$SERVER_NAME 重启成功"
            
            # 发送通知（可以扩展为发送邮件、QQ消息等）
            send_notification "服务器重启成功" "$SERVER_NAME 已自动重启"
        else
            log_message "ERROR" "$SERVER_NAME 重启失败，请手动检查"
            
            # 发送错误通知
            send_notification "服务器重启失败" "$SERVER_NAME 重启失败，需要手动干预"
        fi
    fi
    
    log_message "INFO" "监控完成"
}

# 发送通知函数（占位符，可根据需要扩展）
send_notification() {
    local title=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    log_message "INFO" "通知: $title - $message"
    
    # 这里可以添加发送QQ消息、邮件、短信等通知的代码
    # 例如：
    # 1. 发送QQ消息（使用已有的QQ推送功能）
    # 2. 发送邮件
    # 3. 发送系统通知
    
    # 暂时只记录到日志
    echo "[$timestamp] NOTIFICATION: $title - $message" >> "$LOG_FILE"
}

# 显示帮助信息
show_help() {
    echo "LOF基金服务器监控脚本"
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  monitor     运行监控（默认）"
    echo "  start       启动服务器"
    echo "  stop        停止服务器"
    echo "  status      查看服务器状态"
    echo "  log         查看监控日志"
    echo "  help        显示此帮助信息"
    echo ""
    echo "定时任务配置示例（每5分钟检查一次）:"
    echo "  */5 * * * * /bin/bash $SERVER_DIR/server-monitor.sh monitor"
}

# 停止服务器
stop_server() {
    log_message "INFO" "正在停止 $SERVER_NAME..."
    
    # 查找并杀死进程
    local pids=$(pgrep -f "$SERVER_SCRIPT")
    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill $pid 2>/dev/null
            log_message "INFO" "已发送停止信号到进程: $pid"
        done
        
        # 等待进程结束
        sleep 2
        
        # 强制杀死（如果还在运行）
        pids=$(pgrep -f "$SERVER_SCRIPT")
        if [ -n "$pids" ]; then
            kill -9 $pids 2>/dev/null
            log_message "WARN" "强制杀死进程: $pids"
        fi
        
        log_message "INFO" "$SERVER_NAME 已停止"
    else
        log_message "INFO" "$SERVER_NAME 未在运行"
    fi
}

# 查看服务器状态
show_status() {
    echo "=== $SERVER_NAME 状态检查 ==="
    
    # 检查进程
    local pids=$(pgrep -f "$SERVER_SCRIPT")
    if [ -n "$pids" ]; then
        echo "✅ 进程状态: 运行中"
        echo "   进程PID: $pids"
        echo "   运行时间: $(ps -p $(echo $pids | awk '{print $1}') -o etime= 2>/dev/null || echo "未知")"
    else
        echo "❌ 进程状态: 未运行"
    fi
    
    # 检查端口
    echo ""
    echo "=== 端口检查 ==="
    if netstat -tlnp 2>/dev/null | grep -q ":3001"; then
        echo "✅ HTTP端口(3001): 监听中"
    else
        echo "❌ HTTP端口(3001): 未监听"
    fi
    
    if netstat -tlnp 2>/dev/null | grep -q ":3444"; then
        echo "✅ HTTPS端口(3444): 监听中"
    else
        echo "❌ HTTPS端口(3444): 未监听"
    fi
    
    # 检查API
    echo ""
    echo "=== API检查 ==="
    if curl -s --tlsv1.2 -k "https://localhost:3444/api/status" >/dev/null 2>&1; then
        echo "✅ HTTPS API: 正常"
    else
        echo "❌ HTTPS API: 异常"
    fi
    
    if curl -s "http://localhost:3001/api/status" >/dev/null 2>&1; then
        echo "✅ HTTP API: 正常"
    else
        echo "❌ HTTP API: 异常"
    fi
    
    # 显示监控日志大小
    echo ""
    echo "=== 监控信息 ==="
    if [ -f "$LOG_FILE" ]; then
        local log_size=$(du -h "$LOG_FILE" | cut -f1)
        echo "监控日志: $LOG_FILE ($log_size)"
        echo "最后记录: $(tail -1 "$LOG_FILE" 2>/dev/null | cut -c1-50)..."
    else
        echo "监控日志: 未找到"
    fi
}

# 查看监控日志
show_log() {
    if [ -f "$LOG_FILE" ]; then
        echo "=== 监控日志（最后50行）==="
        tail -50 "$LOG_FILE"
        echo ""
        echo "完整日志文件: $LOG_FILE"
    else
        echo "监控日志文件不存在: $LOG_FILE"
    fi
}

# 主程序
main() {
    local action=${1:-"monitor"}
    
    case $action in
        "monitor")
            monitor_server
            ;;
        "start")
            start_server
            ;;
        "stop")
            stop_server
            ;;
        "status")
            show_status
            ;;
        "log")
            show_log
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo "未知操作: $action"
            show_help
            exit 1
            ;;
    esac
}

# 运行主程序
main "$@"