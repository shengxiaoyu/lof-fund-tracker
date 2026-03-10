#!/bin/bash

# LOF基金查询系统防火墙配置

echo "========================================="
echo "   防火墙配置脚本"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查系统
if [ -f /etc/debian_version ]; then
    echo -e "${GREEN}检测到Debian/Ubuntu系统${NC}"
    FIREWALL_CMD="ufw"
elif [ -f /etc/redhat-release ]; then
    echo -e "${GREEN}检测到RHEL/CentOS系统${NC}"
    FIREWALL_CMD="firewall-cmd"
else
    echo -e "${YELLOW}未知系统，请手动配置防火墙${NC}"
    exit 1
fi

configure_ufw() {
    echo -e "\n${GREEN}配置UFW防火墙...${NC}"
    
    # 检查UFW状态
    sudo ufw status | grep -q "Status: active"
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}UFW未启用，正在启用...${NC}"
        
        # 设置默认策略
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        
        # 开放必要端口
        sudo ufw allow 22/tcp comment 'SSH'
        sudo ufw allow 3000/tcp comment 'LOF Fund Tracker'
        
        # 如果需要Web访问
        read -p "是否开放HTTP/HTTPS端口 (y/n)? " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo ufw allow 80/tcp comment 'HTTP'
            sudo ufw allow 443/tcp comment 'HTTPS'
        fi
        
        # 启用UFW
        echo -e "${YELLOW}启用UFW防火墙...${NC}"
        sudo ufw --force enable
        
        echo -e "${GREEN}✅ UFW配置完成${NC}"
    else
        echo -e "${GREEN}UFW已启用，添加端口规则...${NC}"
        sudo ufw allow 3000/tcp comment 'LOF Fund Tracker'
    fi
    
    # 显示规则
    echo -e "\n${GREEN}当前防火墙规则:${NC}"
    sudo ufw status numbered
}

configure_firewalld() {
    echo -e "\n${GREEN}配置Firewalld...${NC}"
    
    # 检查firewalld状态
    sudo systemctl is-active firewalld > /dev/null
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Firewalld未运行，正在启动...${NC}"
        sudo systemctl start firewalld
        sudo systemctl enable firewalld
    fi
    
    # 添加端口
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --permanent --add-service=ssh
    
    read -p "是否开放HTTP/HTTPS端口 (y/n)? " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo firewall-cmd --permanent --add-service=http
        sudo firewall-cmd --permanent --add-service=https
    fi
    
    # 重新加载配置
    sudo firewall-cmd --reload
    
    echo -e "${GREEN}✅ Firewalld配置完成${NC}"
    
    # 显示配置
    echo -e "\n${GREEN}当前防火墙配置:${NC}"
    sudo firewall-cmd --list-all
}

configure_iptables() {
    echo -e "\n${GREEN}配置iptables...${NC}"
    
    # 保存现有规则
    sudo iptables-save > /tmp/iptables.backup
    
    # 设置默认策略
    sudo iptables -P INPUT DROP
    sudo iptables -P FORWARD DROP
    sudo iptables -P OUTPUT ACCEPT
    
    # 允许已建立的连接
    sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # 允许本地回环
    sudo iptables -A INPUT -i lo -j ACCEPT
    
    # 开放必要端口
    sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
    
    read -p "是否开放HTTP/HTTPS端口 (y/n)? " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
        sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    fi
    
    # 保存规则
    if command -v iptables-save &> /dev/null; then
        sudo iptables-save > /etc/iptables/rules.v4
        echo -e "${GREEN}✅ iptables规则已保存${NC}"
    fi
    
    echo -e "\n${GREEN}当前iptables规则:${NC}"
    sudo iptables -L -n -v
}

# 端口检查
check_ports() {
    echo -e "\n${GREEN}检查端口状态...${NC}"
    
    PORTS="22 3000 80 443"
    for port in $PORTS; do
        if sudo netstat -tuln | grep ":$port " > /dev/null; then
            echo -e "✅ 端口 $port 已监听"
        else
            echo -e "❌ 端口 $port 未监听"
        fi
    done
    
    # 检查外部访问
    echo -e "\n${GREEN}检查外部访问...${NC}"
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "未知")
    echo -e "公网IP: $PUBLIC_IP"
    
    if [ "$PUBLIC_IP" != "未知" ]; then
        echo -e "访问地址: http://$PUBLIC_IP:3000"
        echo -e "${YELLOW}注意: 如果无法访问，请检查路由器端口转发${NC}"
    fi
}

# 安全建议
security_advice() {
    echo -e "\n${GREEN}安全建议:${NC}"
    echo -e "1. 🔐 使用HTTPS替代HTTP"
    echo -e "2. 🔑 设置强密码或使用SSH密钥"
    echo -e "3. 📊 定期查看访问日志"
    echo -e "4. 🔄 保持系统和应用更新"
    echo -e "5. 🛡️  考虑使用Fail2ban防止暴力破解"
    echo -e "6. 📝 启用应用日志记录"
    echo -e "7. 🔍 定期检查异常连接"
}

# 主菜单
main_menu() {
    echo -e "\n${GREEN}选择防火墙配置方式:${NC}"
    echo -e "1. UFW (Ubuntu/Debian推荐)"
    echo -e "2. Firewalld (CentOS/RHEL推荐)"
    echo -e "3. iptables (通用)"
    echo -e "4. 仅检查端口状态"
    echo -e "5. 退出"
    
    read -p "请选择 (1-5): " choice
    
    case $choice in
        1)
            configure_ufw
            ;;
        2)
            configure_firewalld
            ;;
        3)
            configure_iptables
            ;;
        4)
            check_ports
            ;;
        5)
            echo -e "${GREEN}退出${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选择${NC}"
            main_menu
            ;;
    esac
    
    check_ports
    security_advice
}

# 显示标题
echo -e "${GREEN}LOF基金查询系统 - 防火墙配置${NC}"
echo -e "系统: $(uname -a)"
echo -e "IP地址: $(hostname -I | awk '{print $1}')"

# 检查权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}需要root权限，部分操作可能需要sudo密码${NC}"
fi

# 运行主菜单
main_menu

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}防火墙配置完成！${NC}"
echo -e "${GREEN}=========================================${NC}"