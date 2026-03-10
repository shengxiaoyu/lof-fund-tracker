#!/bin/bash

# 安全启动脚本 - 有公网IP无域名的安全方案

echo "========================================="
echo "   LOF基金查询系统 - 安全启动"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 获取公网IP
get_public_ip() {
    IP=$(curl -s --max-time 5 ifconfig.me)
    if [ -z "$IP" ]; then
        IP=$(curl -s --max-time 5 ipinfo.io/ip)
    fi
    if [ -z "$IP" ]; then
        IP="未知"
    fi
    echo $IP
}

# 显示状态
show_status() {
    echo -e "\n${GREEN}系统状态:${NC}"
    
    # 检查进程
    if pgrep -f "node server.js" > /dev/null; then
        echo -e "✅ 应用运行中"
        PID=$(pgrep -f "node server.js")
        echo -e "   进程ID: $PID"
    else
        echo -e "❌ 应用未运行"
    fi
    
    # 检查端口
    echo -e "\n${GREEN}端口状态:${NC}"
    if netstat -tuln | grep :3000 > /dev/null; then
        echo -e "✅ HTTP端口 (3000): 监听中"
    else
        echo -e "❌ HTTP端口 (3000): 未监听"
    fi
    
    if netstat -tuln | grep :3443 > /dev/null; then
        echo -e "✅ HTTPS端口 (3443): 监听中"
    else
        echo -e "❌ HTTPS端口 (3443): 未监听"
    fi
    
    # SSL证书
    echo -e "\n${GREEN}SSL证书:${NC}"
    if [ -f "ssl/cert.pem" ]; then
        CERT_INFO=$(openssl x509 -in ssl/cert.pem -noout -dates 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "✅ 证书有效"
            echo "$CERT_INFO" | while read line; do
                echo "   $line"
            done
        else
            echo -e "❌ 证书无效"
        fi
    else
        echo -e "❌ 证书文件不存在"
    fi
    
    # 访问信息
    echo -e "\n${GREEN}访问信息:${NC}"
    PUBLIC_IP=$(get_public_ip)
    echo -e "   公网IP: $PUBLIC_IP"
    echo -e "   HTTP访问: http://$PUBLIC_IP:3000"
    echo -e "   HTTPS访问: https://$PUBLIC_IP:3443"
    
    if [ -f ".env" ]; then
        AUTH_USER=$(grep AUTH_USER .env | cut -d= -f2)
        echo -e "   用户名: $AUTH_USER"
    fi
}

# 安装依赖
install_deps() {
    echo -e "\n${GREEN}[1/4] 检查依赖...${NC}"
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js未安装${NC}"
        exit 1
    fi
    echo -e "✅ Node.js: $(node -v)"
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm未安装${NC}"
        exit 1
    fi
    echo -e "✅ npm: $(npm -v)"
    
    # 检查openssl
    if ! command -v openssl &> /dev/null; then
        echo -e "${RED}❌ openssl未安装${NC}"
        echo -e "${YELLOW}安装命令: sudo apt install openssl${NC}"
        exit 1
    fi
    echo -e "✅ openssl: $(openssl version)"
    
    # 安装项目依赖
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}安装项目依赖...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ 依赖安装失败${NC}"
            exit 1
        fi
    fi
    
    # 安装安全模块
    if [ ! -d "node_modules/express-basic-auth" ]; then
        echo -e "${YELLOW}安装安全模块...${NC}"
        npm install express-basic-auth
    fi
}

# 配置SSL
setup_ssl() {
    echo -e "\n${GREEN}[2/4] 配置SSL...${NC}"
    
    if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
        echo -e "${YELLOW}SSL证书不存在，正在生成...${NC}"
        ./setup-ssl.sh
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ SSL配置失败${NC}"
            exit 1
        fi
    else
        echo -e "✅ SSL证书已存在"
        
        # 检查证书有效期
        CERT_END=$(openssl x509 -in ssl/cert.pem -noout -enddate 2>/dev/null | cut -d= -f2)
        if [ $? -eq 0 ]; then
            CERT_END_TS=$(date -d "$CERT_END" +%s)
            NOW_TS=$(date +%s)
            DAYS_LEFT=$(( ($CERT_END_TS - $NOW_TS) / 86400 ))
            
            if [ $DAYS_LEFT -lt 30 ]; then
                echo -e "${YELLOW}⚠️  证书即将过期 (剩余 ${DAYS_LEFT} 天)${NC}"
                read -p "是否重新生成证书? (y/n): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    rm -f ssl/cert.pem ssl/key.pem
                    ./setup-ssl.sh
                fi
            else
                echo -e "✅ 证书有效期: 剩余 ${DAYS_LEFT} 天"
            fi
        fi
    fi
}

# 配置防火墙
setup_firewall() {
    echo -e "\n${GREEN}[3/4] 配置防火墙...${NC}"
    
    # 获取当前IP（用于白名单）
    CURRENT_IP=$(get_public_ip)
    
    if [ "$CURRENT_IP" != "未知" ]; then
        echo -e "当前公网IP: $CURRENT_IP"
        read -p "是否只允许当前IP访问? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}配置IP白名单...${NC}"
            
            if command -v ufw &> /dev/null; then
                sudo ufw allow from $CURRENT_IP to any port 3443 comment 'LOF HTTPS Whitelist'
                echo -e "✅ UFW白名单已配置"
            elif command -v firewall-cmd &> /dev/null; then
                sudo firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='$CURRENT_IP' port port='3443' protocol='tcp' accept"
                sudo firewall-cmd --reload
                echo -e "✅ Firewalld白名单已配置"
            else
                echo -e "${YELLOW}⚠️  请手动配置防火墙只允许 $CURRENT_IP 访问3443端口${NC}"
            fi
        else
            echo -e "${YELLOW}开放3443端口给所有IP...${NC}"
            if command -v ufw &> /dev/null; then
                sudo ufw allow 3443/tcp
            elif command -v firewall-cmd &> /dev/null; then
                sudo firewall-cmd --permanent --add-port=3443/tcp
                sudo firewall-cmd --reload
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  无法获取公网IP，请手动配置防火墙${NC}"
    fi
}

# 启动应用
start_app() {
    echo -e "\n${GREEN}[4/4] 启动应用...${NC}"
    
    # 停止现有进程
    if pgrep -f "node server.js" > /dev/null; then
        echo -e "${YELLOW}停止现有进程...${NC}"
        pkill -f "node server.js"
        sleep 2
    fi
    
    # 启动应用
    echo -e "${YELLOW}启动服务器...${NC}"
    nohup node server.js > secure-app.log 2>&1 &
    APP_PID=$!
    
    sleep 3
    
    if ps -p $APP_PID > /dev/null; then
        echo -e "✅ 应用启动成功 (PID: $APP_PID)"
        echo $APP_PID > secure-app.pid
        
        # 等待完全启动
        echo -e "${YELLOW}等待服务就绪...${NC}"
        sleep 5
        
        # 测试HTTPS
        if curl -k -s https://localhost:3443/api/stats > /dev/null; then
            echo -e "✅ HTTPS服务正常"
        else
            echo -e "${YELLOW}⚠️  HTTPS服务可能未就绪，请稍后重试${NC}"
        fi
    else
        echo -e "${RED}❌ 应用启动失败${NC}"
        echo -e "${YELLOW}查看日志: tail -f secure-app.log${NC}"
        exit 1
    fi
}

# 显示访问信息
show_access_info() {
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}       安全配置完成！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    
    PUBLIC_IP=$(get_public_ip)
    
    echo -e "\n🔐 ${GREEN}访问方式:${NC}"
    echo -e "   1. 打开浏览器"
    echo -e "   2. 访问: ${YELLOW}https://$PUBLIC_IP:3443${NC}"
    echo -e "   3. 忽略SSL证书警告（点击'继续'或'高级'）"
    echo -e "   4. 输入用户名密码"
    
    echo -e "\n📋 ${GREEN}登录信息:${NC}"
    if [ -f ".env" ]; then
        AUTH_USER=$(grep AUTH_USER .env | cut -d= -f2)
        AUTH_PASS=$(grep AUTH_PASSWORD .env | cut -d= -f2)
        echo -e "   用户名: ${YELLOW}$AUTH_USER${NC}"
        echo -e "   密码: ${YELLOW}$AUTH_PASS${NC}"
    else
        echo -e "   用户名: ${YELLOW}admin${NC}"
        echo -e "   密码: ${YELLOW}admin123${NC}"
    fi
    
    echo -e "\n⚠️  ${YELLOW}重要提醒:${NC}"
    echo -e "   1. 首次访问会有SSL警告，这是正常的"
    echo -e "   2. 请及时修改默认密码（编辑.env文件）"
    echo -e "   3. 建议使用HTTPS访问（3443端口）"
    echo -e "   4. HTTP访问（3000端口）同样需要密码"
    
    echo -e "\n🔧 ${GREEN}管理命令:${NC}"
    echo -e "   查看状态: ./secure-start.sh status"
    echo -e "   停止服务: ./secure-start.sh stop"
    echo -e "   重启服务: ./secure-start.sh restart"
    echo -e "   查看日志: tail -f secure-app.log"
    
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}     现在可以通过公网安全访问了！${NC}"
    echo -e "${GREEN}=========================================${NC}"
}

# 停止应用
stop_app() {
    echo -e "\n${GREEN}停止应用...${NC}"
    
    if [ -f "secure-app.pid" ]; then
        kill $(cat secure-app.pid) 2>/dev/null
        rm -f secure-app.pid
        echo -e "✅ 应用已停止"
    elif pgrep -f "node server.js" > /dev/null; then
        pkill -f "node server.js"
        echo -e "✅ 应用已停止"
    else
        echo -e "✅ 应用未运行"
    fi
}

# 主函数
main() {
    case $1 in
        status)
            show_status
            exit 0
            ;;
        stop)
            stop_app
            exit 0
            ;;
        restart)
            stop_app
            exec $0
            ;;
        *)
            echo -e "${GREEN}开始安全部署...${NC}"
            ;;
    esac
    
    install_deps
    setup_ssl
    setup_firewall
    start_app
    show_access_info
}

# 执行
main "$@"