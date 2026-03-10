# 公网访问指南

## 🚀 快速开始

### 最简单的方法：直接端口访问
```bash
# 1. 启动应用
cd /root/.openclaw/workspace/lof-fund-tracker
./start.sh

# 2. 获取你的公网IP
curl ifconfig.me

# 3. 访问地址
# http://你的公网IP:3000
```

## 📋 四种公网访问方案

### 方案一：Nginx反向代理（推荐生产使用）
**优点**：性能好、支持HTTPS、可配置域名
**适合**：长期运行的生产环境

```bash
# 1. 运行部署脚本
./deploy-public.sh nginx fund.yourdomain.com

# 2. 按照提示配置
# 3. 访问: http://fund.yourdomain.com
```

### 方案二：ngrok内网穿透（最快）
**优点**：5分钟搞定、无需公网IP、自动HTTPS
**适合**：临时测试、快速演示

```bash
# 1. 注册ngrok账号获取token
# 访问: https://dashboard.ngrok.com

# 2. 运行部署脚本
./deploy-public.sh ngrok

# 3. 访问ngrok提供的域名
# 例如: https://abc123.ngrok.io
```

### 方案三：Cloudflare Tunnel（免费）
**优点**：完全免费、无需公网IP、自带CDN
**适合**：个人项目、小型网站

```bash
# 1. 运行部署脚本
./deploy-public.sh cloudflare fund.yourdomain.com

# 2. 按照提示配置Cloudflare
# 3. 访问: https://fund.yourdomain.com
```

### 方案四：直接端口转发
**优点**：最简单、无需额外软件
**适合**：有公网IP的服务器

```bash
# 1. 运行部署脚本
./deploy-public.sh port

# 2. 配置防火墙
./firewall-setup.sh

# 3. 访问: http://你的公网IP:3000
```

## 🔧 详细配置步骤

### 1. 确保应用正常运行
```bash
# 检查应用状态
./deploy-public.sh status

# 如果未运行，启动应用
./start.sh
```

### 2. 配置防火墙
```bash
# 运行防火墙配置脚本
./firewall-setup.sh

# 选择适合你系统的防火墙
# 推荐开放端口: 3000 (应用), 80/443 (Web)
```

### 3. 路由器端口转发（如果需要）
如果你的服务器在内网，需要在路由器设置：
1. 登录路由器管理界面
2. 找到"端口转发"或"虚拟服务器"
3. 添加规则：
   - 外部端口: 3000
   - 内部IP: 你的服务器内网IP
   - 内部端口: 3000
   - 协议: TCP

### 4. 获取公网访问地址
```bash
# 查看当前配置的访问地址
./deploy-public.sh status
```

## 🌐 域名配置

### 购买域名
推荐域名注册商：
- Namecheap
- GoDaddy
- 阿里云
- 腾讯云

### DNS解析
将域名解析到你的服务器：
```
记录类型   主机名       值
A         fund        你的公网IP
CNAME     www.fund    fund.yourdomain.com
```

### SSL证书（HTTPS）
```bash
# 使用Let's Encrypt免费证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d fund.yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

## 🛡️ 安全配置

### 1. 修改默认端口（可选）
```javascript
// 修改server.js中的端口
const PORT = process.env.PORT || 3001;
```

### 2. 添加访问控制
```javascript
// 在server.js中添加基本认证
const basicAuth = require('express-basic-auth');

app.use('/admin', basicAuth({
    users: { 'admin': '你的密码' },
    challenge: true
}));
```

### 3. 启用HTTPS
```javascript
// 使用HTTPS
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('private.key'),
    cert: fs.readFileSync('certificate.crt')
};

https.createServer(options, app).listen(443);
```

## 📊 监控与维护

### 查看访问日志
```bash
# 应用日志
tail -f app.log

# Nginx访问日志
tail -f /var/log/nginx/access.log

# 错误日志
tail -f /var/log/nginx/error.log
```

### 性能监控
```bash
# 查看内存使用
free -h

# 查看CPU使用
top

# 查看网络连接
netstat -tuln
```

### 自动重启
```bash
# 使用PM2管理
npm install -g pm2
pm2 start server.js --name lof-fund-tracker
pm2 startup
pm2 save
```

## 🚨 故障排除

### 无法访问
1. **检查应用是否运行**
   ```bash
   ./deploy-public.sh status
   ```

2. **检查端口是否开放**
   ```bash
   sudo netstat -tuln | grep :3000
   ```

3. **检查防火墙**
   ```bash
   sudo ufw status
   # 或
   sudo firewall-cmd --list-all
   ```

4. **检查路由器设置**
   - 确认端口转发配置正确
   - 检查路由器防火墙

### 速度慢
1. **启用Gzip压缩**
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

2. **配置缓存**
   ```nginx
   # Nginx配置
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

### SSL证书问题
1. **证书过期**
   ```bash
   sudo certbot renew
   ```

2. **域名不匹配**
   ```bash
   sudo certbot --nginx -d fund.yourdomain.com
   ```

## 📱 移动端访问

### 响应式设计
系统已支持响应式设计，手机访问自动适配。

### PWA支持（可选）
可以添加PWA功能，支持离线访问：
```html
<!-- 在index.html中添加 -->
<link rel="manifest" href="/manifest.json">
```

## 🔄 备份与恢复

### 数据库备份
```bash
# 备份脚本
cp funds.db funds.db.backup.$(date +%Y%m%d)

# 恢复
cp funds.db.backup.20240305 funds.db
```

### 完整备份
```bash
# 备份整个项目
tar -czf lof-fund-tracker-backup.tar.gz .

# 恢复
tar -xzf lof-fund-tracker-backup.tar.gz
```

## 📞 技术支持

### 常见问题
1. **Q: 访问显示"无法连接"**
   A: 检查防火墙和路由器端口转发

2. **Q: HTTPS证书警告**
   A: 确保证书已正确安装并信任

3. **Q: 搜索功能失效**
   A: 检查网络连接，确保能访问东方财富网

### 获取帮助
- 查看日志：`tail -f app.log`
- 检查状态：`./deploy-public.sh status`
- 重启应用：`./deploy-public.sh restart`

## 🎯 最佳实践

1. **生产环境**：使用Nginx + HTTPS + 域名
2. **测试环境**：使用ngrok快速测试
3. **个人使用**：Cloudflare Tunnel免费方案
4. **安全第一**：定期更新、启用HTTPS、设置强密码

---

**快速开始命令总结**：
```bash
# 1. 启动应用
./start.sh

# 2. 配置公网访问
./deploy-public.sh nginx fund.yourdomain.com

# 3. 配置防火墙
./firewall-setup.sh

# 4. 访问网站
# http://fund.yourdomain.com
```

**记住**：安全第一！不要将敏感数据暴露在公网，定期备份数据，保持系统和应用更新。