#!/bin/bash

# LOF基金服务器管理脚本
# 提供简单的一键管理功能

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 脚本路径
BASE_DIR="/root/.openclaw/workspace/lof-fund-tracker"
MONITOR_SCRIPT="$BASE_DIR/server-monitor.sh"

# 显示标题
show_title() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}    LOF基金查询服务器管理工具${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 显示菜单
show_menu() {
    echo "请选择操作："
    echo "  ${GREEN}1${NC}. 启动服务器"
    echo "  ${RED}2${NC}. 停止服务器"
    echo "  ${YELLOW}3${NC}. 重启服务器"
    echo "  ${BLUE}4${NC}. 查看服务器状态"
    echo "  ${BLUE}5${NC}. 查看监控日志"
    echo "  ${BLUE}6${NC}. 运行监控检查"
    echo "  ${BLUE}7${NC}. 测试基金查询"
    echo "  ${BLUE}8${NC}. 查看访问地址"
    echo "  ${YELLOW}9${NC}. 配置Cron监控"
    echo "  ${RED}0${NC}. 退出"
    echo ""
    echo -n "请输入选择 [0-9]: "
}

# 执行操作
execute_action() {
    case $1 in
        1)
            echo -e "${GREEN}正在启动服务器...${NC}"
            $MONITOR_SCRIPT start
            ;;
        2)
            echo -e "${RED}正在停止服务器...${NC}"
            $MONITOR_SCRIPT stop
            ;;
        3)
            echo -e "${YELLOW}正在重启服务器...${NC}"
            $MONITOR_SCRIPT stop
            sleep 2
            $MONITOR_SCRIPT start
            ;;
        4)
            echo -e "${BLUE}服务器状态：${NC}"
            $MONITOR_SCRIPT status
            ;;
        5)
            echo -e "${BLUE}监控日志：${NC}"
            $MONITOR_SCRIPT log
            ;;
        6)
            echo -e "${BLUE}运行监控检查...${NC}"
            $MONITOR_SCRIPT monitor
            ;;
        7)
            test_fund_query
            ;;
        8)
            show_access_info
            ;;
        9)
            setup_cron
            ;;
        0)
            echo -e "${GREEN}再见！${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效的选择！${NC}"
            ;;
    esac
}

# 测试基金查询
test_fund_query() {
    echo -e "${BLUE}=== 基金查询测试 ===${NC}"
    
    # 测试服务器状态
    echo -n "测试服务器状态... "
    if curl -s --tlsv1.2 -k "https://localhost:3444/api/status" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 正常${NC}"
    else
        echo -e "${RED}❌ 异常${NC}"
        return
    fi
    
    # 测试基金查询
    echo -n "测试基金查询(162411)... "
    result=$(curl -s --tlsv1.2 -k "https://localhost:3444/api/fund/162411" 2>/dev/null)
    if echo "$result" | grep -q "success"; then
        echo -e "${GREEN}✅ 正常${NC}"
        
        # 显示简要信息
        name=$(echo "$result" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['data']['name'])" 2>/dev/null || echo "未知")
        price=$(echo "$result" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['data']['market']['price'])" 2>/dev/null || echo "--")
        premium=$(echo "$result" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['data']['calculations']['premiumRate'])" 2>/dev/null || echo "--")
        
        echo "  基金: $name"
        echo "  价格: $price"
        echo "  溢价: $premium"
    else
        echo -e "${RED}❌ 失败${NC}"
    fi
    
    # 测试搜索功能
    echo -n "测试搜索功能(161226)... "
    if curl -s --tlsv1.2 -k "https://localhost:3444/api/search?keyword=161226" | grep -q "success"; then
        echo -e "${GREEN}✅ 正常${NC}"
    else
        echo -e "${RED}❌ 失败${NC}"
    fi
}

# 显示访问信息
show_access_info() {
    echo -e "${BLUE}=== 访问信息 ===${NC}"
    echo ""
    echo -e "${GREEN}🌐 Web界面：${NC}"
    echo "  HTTPS: https://43.161.221.10:3444"
    echo "  HTTP:  http://43.161.221.10:3001"
    echo ""
    echo -e "${GREEN}🚀 API接口：${NC}"
    echo "  基金查询: curl -k --tlsv1.2 \"https://43.161.221.10:3444/api/fund/162411\""
    echo "  基金搜索: curl -k \"https://43.161.221.10:3444/api/search?keyword=161226\""
    echo "  状态检查: curl -k \"https://43.161.221.10:3444/api/status\""
    echo ""
    echo -e "${GREEN}📊 监控信息：${NC}"
    echo "  监控脚本: $MONITOR_SCRIPT"
    echo "  监控日志: $BASE_DIR/server-monitor.log"
    echo "  Cron配置: /etc/cron.d/lof-fund-monitor"
}

# 配置Cron
setup_cron() {
    echo -e "${BLUE}=== 配置Cron监控 ===${NC}"
    
    if [ -f "$BASE_DIR/cron-setup.sh" ]; then
        $BASE_DIR/cron-setup.sh
    else
        echo -e "${YELLOW}⚠️  Cron配置脚本不存在，手动配置：${NC}"
        echo ""
        echo "手动添加Cron任务："
        echo "1. 编辑crontab: crontab -e"
        echo "2. 添加以下行："
        echo "   */5 * * * * /bin/bash $MONITOR_SCRIPT monitor >/dev/null 2>&1"
        echo "3. 保存并退出"
    fi
}

# 主程序
main() {
    # 检查监控脚本是否存在
    if [ ! -f "$MONITOR_SCRIPT" ]; then
        echo -e "${RED}错误：监控脚本不存在！${NC}"
        echo "请确保: $MONITOR_SCRIPT 存在"
        exit 1
    fi
    
    # 显示标题
    show_title
    
    # 交互式菜单
    while true; do
        show_menu
        read choice
        
        echo ""
        execute_action "$choice"
        echo ""
        
        # 按任意键继续
        if [ "$choice" != "0" ]; then
            echo -n "按回车键继续..."
            read
            clear
            show_title
        fi
    done
}

# 如果传递了参数，直接执行
if [ $# -gt 0 ]; then
    case $1 in
        "start") $MONITOR_SCRIPT start ;;
        "stop") $MONITOR_SCRIPT stop ;;
        "status") $MONITOR_SCRIPT status ;;
        "restart") $MONITOR_SCRIPT stop && sleep 2 && $MONITOR_SCRIPT start ;;
        "monitor") $MONITOR_SCRIPT monitor ;;
        "log") $MONITOR_SCRIPT log ;;
        "test") test_fund_query ;;
        "help"|"-h"|"--help")
            echo "用法: $0 [命令]"
            echo "命令:"
            echo "  start     启动服务器"
            echo "  stop      停止服务器"
            echo "  restart   重启服务器"
            echo "  status    查看状态"
            echo "  monitor   运行监控"
            echo "  log       查看日志"
            echo "  test      测试功能"
            echo "  help      显示帮助"
            ;;
        *) main ;;
    esac
else
    main
fi