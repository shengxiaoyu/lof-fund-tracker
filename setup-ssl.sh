#!/bin/bash

# SSL证书和安全配置脚本

echo "========================================="
echo "   SSL证书和安全配置"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 创建SSL目录
mkdir -p ssl
cd ssl

# 获取公网IP
PUBLIC_IP=$(curl -s ifconfig.me)
if [ -z "$PUBLIC_IP" ]; then
    echo -e "${RED}❌ 无法获取公网IP${NC}"
    PUBLIC_IP="localhost"
fi

echo -e "\n${GREEN}[1/4] 生成SSL证书...${NC}"

# 生成私钥和证书
openssl req -x509 -newkey rsa:4096 \
  -keyout key.pem \
  -out cert.pem \
  -days 3650 \
  -nodes \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=LOF Fund Tracker/CN=$PUBLIC_IP" \
  -addext "subjectAltName=IP:$PUBLIC_IP,DNS:localhost"

if [ $? -eq 0 ]; then
    echo -e "✅ SSL证书生成成功"
    echo -e "   证书文件: ssl/cert.pem"
    echo -e "   私钥文件: ssl/key.pem"
    echo -e "   有效期: 10年"
    echo -e "   域名/IP: $PUBLIC_IP"
else
    echo -e "${RED}❌ SSL证书生成失败${NC}"
    exit 1
fi

# 设置文件权限
chmod 600 key.pem cert.pem
chmod 700 ..

echo -e "\n${GREEN}[2/4] 配置环境变量...${NC}"

# 创建/更新.env文件
if [ ! -f "../.env" ]; then
    cp ../.env.example ../.env
fi

# 设置安全配置
cat >> ../.env << EOF

# 安全配置
HTTPS_PORT=3443
AUTH_USER=admin
AUTH_PASSWORD=$(openssl rand -base64 12)
SSL_CERT=./ssl/cert.pem
SSL_KEY=./ssl/key.pem
EOF

echo -e "✅ 环境变量配置完成"
echo -e "   HTTPS端口: 3443"
echo -e "   用户名: admin"
echo -e "   密码: 已生成随机密码（查看.env文件）"

echo -e "\n${GREEN}[3/4] 安装依赖...${NC}"

cd ..
npm install express-basic-auth

if [ $? -eq 0 ]; then
    echo -e "✅ 安全模块安装完成"
else
    echo -e "${YELLOW}⚠️  依赖安装失败，请手动安装:${NC}"
    echo -e "   npm install express-basic-auth"
fi

echo -e "\n${GREEN}[4/4] 防火墙配置...${NC}"

# 检查并开放HTTPS端口
if command -v ufw &> /dev/null; then
    sudo ufw allow 3443/tcp comment 'LOF Fund Tracker HTTPS'
    echo -e "✅ UFW已开放3443端口"
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --permanent --add-port=3443/tcp
    sudo firewall-cmd --reload
    echo -e "✅ Firewalld已开放3443端口"
fi

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}安全配置完成！${NC}"
echo -e "${GREEN}=========================================${NC}"

echo -e "\n📋 配置摘要:"
echo -e "   公网IP: $PUBLIC_IP"
echo -e "   访问地址: https://$PUBLIC_IP:3443"
echo -e "   用户名: admin"
echo -e "   密码: 查看 .env 文件中的 AUTH_PASSWORD"
echo -e "   SSL证书: 自签名 (有效期10年)"

echo -e "\n🚀 启动命令:"
echo -e "   ./secure-start.sh"

echo -e "\n⚠️  重要提醒:"
echo -e "   1. 首次访问会有SSL证书警告，点击继续即可"
echo -e "   2. 请及时修改默认密码"
echo -e "   3. 建议将IP加入防火墙白名单"
echo -e "   4. 定期备份证书和配置文件"

echo -e "\n🔧 后续管理:"
echo -e "   查看状态: ./secure-start.sh status"
echo -e "   修改密码: 编辑 .env 文件中的 AUTH_PASSWORD"
echo -e "   重启服务: ./secure-start.sh restart"

echo -e "\n${GREEN}配置完成！现在可以安全地通过公网IP访问了。${NC}"