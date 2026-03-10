#!/bin/bash

# 修复防火墙配置脚本

echo "========================================="
echo "   修复防火墙配置"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}需要root权限，使用sudo运行${NC}"
    exec sudo "$0" "$@"
fi

# 备份当前规则
backup_rules() {
    echo -e "\n${GREEN}[1/4] 备份当前规则...${NC}"
    BACKUP_FILE="/tmp/iptables-backup-$(date +%Y%m%d-%H%M%S).rules"
    iptables-save > $BACKUP_FILE
    echo -e "✅ 规则已备份到: $BACKUP_FILE"
}

# 添加端口规则
add_port_rules() {
    echo -e "\n${GREEN}[2/4] 添加端口规则...${NC}"
    
    # 检查YJ-FIREWALL-INPUT链是否存在
    if iptables -L YJ-FIREWALL-INPUT -n > /dev/null 2>&1; then
        echo -e "✅ 找到YJ-FIREWALL-INPUT链"
        
        # 添加HTTP端口规则
        iptables -I YJ-FIREWALL-INPUT 1 -p tcp --dport 3000 -j ACCEPT
        echo -e "✅ 添加端口3000规则"
        
        # 添加HTTPS端口规则
        iptables -I YJ-FIREWALL-INPUT 2 -p tcp --dport 3443 -j ACCEPT
        echo -e "✅ 添加端口3443规则"
        
        # 添加SSH端口规则（如果不存在）
        if ! iptables -L YJ-FIREWALL-INPUT -n | grep -q "dpt:22"; then
            iptables -I YJ-FIREWALL-INPUT 3 -p tcp --dport 22 -j ACCEPT
            echo -e "✅ 添加端口22规则"
        fi
    else
        echo -e "${YELLOW}⚠️  YJ-FIREWALL-INPUT链不存在，使用默认INPUT链${NC}"
        
        # 添加规则到默认INPUT链
        iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
        iptables -A INPUT -p tcp --dport 3443 -j ACCEPT
        iptables -A INPUT -p tcp --dport 22 -j ACCEPT
        
        echo -e "✅ 规则已添加到默认INPUT链"
    fi
}

# 配置默认策略
configure_default_policy() {
    echo -e "\n${GREEN}[3/4] 配置默认策略...${NC}"
    
    # 允许已建立的连接
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # 允许本地回环
    iptables -A INPUT -i lo -j ACCEPT
    
    # 允许ICMP（ping）
    iptables -A INPUT -p icmp -j ACCEPT
    
    echo -e "✅ 默认策略配置完成"
}

# 保存规则
save_rules() {
    echo -e "\n${GREEN}[4/4] 保存规则...${NC}"
    
    # 尝试使用系统保存方法
    if command -v iptables-save &> /dev/null; then
        # 保存IPv4规则
        iptables-save > /etc/sysconfig/iptables 2>/dev/null || \
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || \
        iptables-save > /etc/iptables.up.rules 2>/dev/null
        
        echo -e "✅ 规则已保存"
        
        # 显示保存位置
        if [ -f "/etc/sysconfig/iptables" ]; then
            echo -e "   保存位置: /etc/sysconfig/iptables"
        elif [ -f "/etc/iptables/rules.v4" ]; then
            echo -e "   保存位置: /etc/iptables/rules.v4"
        elif [ -f "/etc/iptables.up.rules" ]; then
            echo -e "   保存位置: /etc/iptables.up.rules"
        fi
    else
        echo -e "${YELLOW}⚠️  iptables-save未找到，请手动保存规则${NC}"
        echo -e "   运行: iptables-save > /etc/iptables/rules.v4"
    fi
}

# 显示当前配置
show_config() {
    echo -e "\n${GREEN}当前防火墙配置:${NC}"
    echo -e "========================================="
    
    # 显示INPUT链
    echo -e "📋 INPUT链规则:"
    iptables -L INPUT -n -v | head -20
    
    echo -e "\n📋 YJ-FIREWALL-INPUT链规则:"
    if iptables -L YJ-FIREWALL-INPUT -n > /dev/null 2>&1; then
        iptables -L YJ-FIREWALL-INPUT -n -v
    else
        echo -e "❌ 链不存在"
    fi
    
    echo -e "\n🔍 监听端口:"
    netstat -tulpn | grep -E ":(3000|3443|22)" || echo "无相关端口监听"
}

# 创建开机启动脚本
create_startup_script() {
    echo -e "\n${GREEN}创建开机启动配置...${NC}"
    
    # 创建systemd服务
    cat > /etc/systemd/system/lof-firewall.service << EOF
[Unit]
Description=LOF Fund Tracker Firewall Rules
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'iptables-restore < /etc/iptables/rules.v4'
ExecReload=/bin/bash -c 'iptables-restore < /etc/iptables/rules.v4'
ExecStop=/bin/bash -c 'iptables -F'

[Install]
WantedBy=multi-user.target
EOF
    
    # 启用服务
    systemctl enable lof-firewall.service 2>/dev/null
    
    echo -e "✅ 开机启动配置完成"
}

# 测试连接
test_connection() {
    echo -e "\n${GREEN}测试连接...${NC}"
    
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    echo -e "1. 本地测试:"
    if curl -s "http://$LOCAL_IP:3000/api/stats" > /dev/null 2>&1; then
        echo -e "✅ HTTP (3000) 本地连接成功"
    else
        echo -e "❌ HTTP (3000) 本地连接失败"
    fi
    
    if curl -k -s "https://$LOCAL_IP:3443/api/stats" > /dev/null 2>&1; then
        echo -e "✅ HTTPS (3443) 本地连接成功"
    else
        echo -e "❌ HTTPS (3443) 本地连接失败"
    fi
    
    echo -e "\n2. 外部访问地址:"
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "未知")
    echo -e "   HTTP:  http://$PUBLIC_IP:3000"
    echo -e "   HTTPS: https://$PUBLIC_IP:3443"
    
    echo -e "\n3. 登录信息:"
    echo -e "   用户名: admin"
    echo -e "   密码: 查看 /root/.openclaw/workspace/lof-fund-tracker/.env 文件"
}

# 主函数
main() {
    echo -e "${GREEN}开始修复防火墙配置...${NC}"
    
    backup_rules
    add_port_rules
    configure_default_policy
    save_rules
    create_startup_script
    
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}       防火墙配置修复完成！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    
    show_config
    test_connection
    
    echo -e "\n${GREEN}🎯 现在可以尝试访问:${NC}"
    echo -e "   浏览器: https://43.161.221.10:3443"
    echo -e "   curl: curl -k --tlsv1.2 -u \"admin:密码\" \"https://43.161.221.10:3443/api/stats\""
    
    echo -e "\n${YELLOW}⚠️  如果还有问题，请检查:${NC}"
    echo -e "   1. 路由器端口转发 (3000, 3443)"
    echo -e "   2. 云服务商安全组规则"
    echo -e "   3. 服务器是否在运行: ./secure-start.sh status"
}

# 执行
main