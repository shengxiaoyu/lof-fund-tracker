#!/bin/bash

# LOF基金查询系统公网部署脚本

echo "========================================="
echo "   LOF基金查询系统公网部署"
echo "========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查参数
if [ $# -eq 0 ]; then
    echo -e "${YELLOW}使用方法:${NC}"
    echo "  $0 nginx     - 使用Nginx反向代理"
    echo "  $0 ngrok     - 使用ngrok内网穿透"
    echo "  $0 cloudflare - 使用Cloudflare Tunnel"
    echo "  $0 port      - 直接端口转发"
    exit 1
fi

METHOD=$1
DOMAIN=${2:-"fund.example.com"}

# 检查系统
check_system() {
    echo -e "\n${GREEN}[1/6] 检查系统环境...${NC}"
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js未安装${NC}"
        exit 1
    fi
    echo -e "✅ Node.js版本: $(node -v)"
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm未安装${NC}"
        exit 1
    fi
    echo -e "✅ npm版本: $(npm -v)"
    
    # 检查项目
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ 不在项目目录中${NC}"
        exit 1
    fi
    echo -e "✅ 项目目录正常"
}

# 安装依赖
install_deps() {
    echo -e "\n${GREEN}[2/6] 安装依赖...${NC}"
    
    if [ ! -d "node_modules" ]; then
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ 依赖安装失败${NC}"
            exit 1
        fi
        echo -e "✅ 依赖安装完成"
    else
        echo -e "✅ 依赖已存在"
    fi
}

# 启动应用
start_app() {
    echo -e "\n${GREEN}[3/6] 启动应用...${NC}"
    
    # 检查是否已经在运行
    if pgrep -f "node server.js" > /dev/null; then
        echo -e "✅ 应用已经在运行"
        return
    fi
    
    # 启动应用
    nohup node server.js > app.log 2>&1 &
    APP_PID=$!
    
    sleep 3
    if ps -p $APP_PID > /dev/null; then
        echo -e "✅ 应用启动成功 (PID: $APP_PID)"
        echo $APP_PID > app.pid
    else
        echo -e "${RED}❌ 应用启动失败${NC}"
        exit 1
    fi
}

# 方法：Nginx反向代理
deploy_nginx() {
    echo -e "\n${GREEN}[4/6] 配置Nginx反向代理...${NC}"
    
    # 检查Nginx
    if ! command -v nginx &> /dev/null; then
        echo -e "${YELLOW}⚠️  Nginx未安装，正在安装...${NC}"
        sudo apt update
        sudo apt install -y nginx
    fi
    
    # 创建Nginx配置
    NGINX_CONF="/etc/nginx/sites-available/lof-fund-tracker"
    
    sudo tee $NGINX_CONF > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # 启用站点
    sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
    sudo nginx -t
    
    if [ $? -eq 0 ]; then
        sudo systemctl reload nginx
        echo -e "✅ Nginx配置完成"
        echo -e "🌐 访问地址: http://$DOMAIN"
        
        # 询问是否配置HTTPS
        read -p "是否配置HTTPS (y/n)? " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            configure_ssl
        fi
    else
        echo -e "${RED}❌ Nginx配置错误${NC}"
    fi
}

# 配置SSL
configure_ssl() {
    echo -e "\n${GREEN}[5/6] 配置SSL证书...${NC}"
    
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}⚠️  Certbot未安装，正在安装...${NC}"
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    sudo certbot --nginx -d $DOMAIN
    
    if [ $? -eq 0 ]; then
        echo -e "✅ SSL证书配置完成"
        echo -e "🔐 访问地址: https://$DOMAIN"
    else
        echo -e "${YELLOW}⚠️  SSL证书配置失败，请手动配置${NC}"
    fi
}

# 方法：ngrok
deploy_ngrok() {
    echo -e "\n${GREEN}[4/6] 配置ngrok...${NC}"
    
    # 检查ngrok
    if ! command -v ngrok &> /dev/null; then
        echo -e "${YELLOW}⚠️  ngrok未安装，正在安装...${NC}"
        wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
        tar -xzf ngrok-v3-stable-linux-amd64.tgz
        sudo mv ngrok /usr/local/bin/
        rm ngrok-v3-stable-linux-amd64.tgz
        
        echo -e "${YELLOW}⚠️  请先注册ngrok账号并获取authtoken${NC}"
        echo -e "${YELLOW}   访问: https://dashboard.ngrok.com/get-started/your-authtoken${NC}"
        read -p "请输入ngrok authtoken: " NGROK_TOKEN
        ngrok config add-authtoken $NGROK_TOKEN
    fi
    
    # 启动ngrok
    echo -e "🚀 启动ngrok隧道..."
    nohup ngrok http 3000 > ngrok.log 2>&1 &
    NGROK_PID=$!
    echo $NGROK_PID > ngrok.pid
    
    sleep 5
    
    # 获取公网地址
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -n "$NGROK_URL" ]; then
        echo -e "✅ ngrok启动成功"
        echo -e "🌐 访问地址: $NGROK_URL"
        echo -e "📋 查看日志: tail -f ngrok.log"
    else
        echo -e "${RED}❌ ngrok启动失败${NC}"
        echo -e "${YELLOW}查看日志: tail -f ngrok.log${NC}"
    fi
}

# 方法：Cloudflare Tunnel
deploy_cloudflare() {
    echo -e "\n${GREEN}[4/6] 配置Cloudflare Tunnel...${NC}"
    
    # 检查cloudflared
    if ! command -v cloudflared &> /dev/null; then
        echo -e "${YELLOW}⚠️  cloudflared未安装，正在安装...${NC}"
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    fi
    
    echo -e "${YELLOW}⚠️  请先登录Cloudflare账号${NC}"
    echo -e "${YELLOW}   运行: cloudflared tunnel login${NC}"
    echo -e "${YELLOW}   然后创建隧道: cloudflared tunnel create lof-fund${NC}"
    echo -e "${YELLOW}   配置DNS: cloudflared tunnel route dns lof-fund $DOMAIN${NC}"
    
    read -p "按回车继续查看配置示例..." -n 1 -r
    echo
    
    # 显示配置示例
    cat << EOF

📋 Cloudflare Tunnel配置示例：

1. 登录Cloudflare:
   cloudflared tunnel login

2. 创建隧道:
   cloudflared tunnel create lof-fund

3. 配置DNS:
   cloudflared tunnel route dns lof-fund $DOMAIN

4. 创建配置文件 ~/.cloudflared/config.yml:
   tunnel: lof-fund
   credentials-file: /root/.cloudflared/隧道id.json
   originRequest:
     connectTimeout: 30s
   ingress:
     - hostname: $DOMAIN
       service: http://localhost:3000
     - service: http_status:404

5. 启动隧道:
   cloudflared tunnel run lof-fund

6. 访问地址: https://$DOMAIN
EOF
}

# 方法：端口转发
deploy_port() {
    echo -e "\n${GREEN}[4/6] 配置端口转发...${NC}"
    
    # 获取公网IP
    PUBLIC_IP=$(curl -s ifconfig.me)
    
    if [ -z "$PUBLIC_IP" ]; then
        echo -e "${RED}❌ 无法获取公网IP${NC}"
        echo -e "${YELLOW}请检查网络连接或使用其他方法${NC}"
        exit 1
    fi
    
    echo -e "🌐 你的公网IP: $PUBLIC_IP"
    
    # 检查防火墙
    if command -v ufw &> /dev/null; then
        echo -e "🔧 配置防火墙..."
        sudo ufw allow 3000/tcp
        sudo ufw enable
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --reload
    fi
    
    echo -e "✅ 端口转发配置完成"
    echo -e "🌐 访问地址: http://$PUBLIC_IP:3000"
    echo -e "${YELLOW}⚠️  注意: 确保路由器已配置端口转发(3000)${NC}"
}

# 显示部署信息
show_info() {
    echo -e "\n${GREEN}[6/6] 部署完成！${NC}"
    echo -e "========================================="
    echo -e "   LOF基金查询系统部署信息"
    echo -e "========================================="
    echo -e "📊 应用状态: ${GREEN}运行中${NC}"
    echo -e "📁 项目目录: $(pwd)"
    echo -e "📝 应用日志: tail -f app.log"
    echo -e "🛑 停止应用: kill \$(cat app.pid)"
    
    case $METHOD in
        nginx)
            echo -e "🌐 访问地址: http://$DOMAIN"
            echo -e "🔧 配置位置: /etc/nginx/sites-available/lof-fund-tracker"
            ;;
        ngrok)
            echo -e "🌐 访问地址: 查看ngrok.log获取"
            echo -e "📋 ngrok日志: tail -f ngrok.log"
            ;;
        cloudflare)
            echo -e "🌐 访问地址: https://$DOMAIN"
            echo -e "🔧 配置位置: ~/.cloudflared/config.yml"
            ;;
        port)
            PUBLIC_IP=$(curl -s ifconfig.me)
            echo -e "🌐 访问地址: http://$PUBLIC_IP:3000"
            ;;
    esac
    
    echo -e "========================================="
    echo -e "📋 管理命令:"
    echo -e "   查看状态: ./deploy-public.sh status"
    echo -e "   停止应用: ./deploy-public.sh stop"
    echo -e "   重启应用: ./deploy-public.sh restart"
    echo -e "========================================="
}

# 状态检查
check_status() {
    echo -e "\n${GREEN}系统状态检查...${NC}"
    
    # 检查应用
    if [ -f "app.pid" ] && ps -p $(cat app.pid) > /dev/null; then
        echo -e "✅ 应用运行中 (PID: $(cat app.pid))"
    else
        echo -e "${RED}❌ 应用未运行${NC}"
    fi
    
    # 检查端口
    if netstat -tuln | grep :3000 > /dev/null; then
        echo -e "✅ 端口3000监听中"
    else
        echo -e "${RED}❌ 端口3000未监听${NC}"
    fi
    
    # 检查API
    if curl -s http://localhost:3000/api/stats > /dev/null; then
        echo -e "✅ API接口正常"
    else
        echo -e "${RED}❌ API接口异常${NC}"
    fi
}

# 停止应用
stop_app() {
    echo -e "\n${GREEN}停止应用...${NC}"
    
    if [ -f "app.pid" ]; then
        kill $(cat app.pid) 2>/dev/null
        rm -f app.pid
        echo -e "✅ 应用已停止"
    fi
    
    if [ -f "ngrok.pid" ]; then
        kill $(cat ngrok.pid) 2>/dev/null
        rm -f ngrok.pid
        echo -e "✅ ngrok已停止"
    fi
}

# 主流程
main() {
    case $1 in
        status)
            check_status
            exit 0
            ;;
        stop)
            stop_app
            exit 0
            ;;
        restart)
            stop_app
            exec $0 $METHOD $DOMAIN
            ;;
    esac
    
    check_system
    install_deps
    start_app
    
    case $METHOD in
        nginx)
            deploy_nginx
            ;;
        ngrok)
            deploy_ngrok
            ;;
        cloudflare)
            deploy_cloudflare
            ;;
        port)
            deploy_port
            ;;
        *)
            echo -e "${RED}❌ 未知方法: $METHOD${NC}"
            exit 1
            ;;
    esac
    
    show_info
}

# 执行主函数
main "$@"