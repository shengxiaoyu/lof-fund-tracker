# 部署指南

## 🚀 快速部署

### 方法一：使用启动脚本（推荐）

```bash
# 1. 克隆或下载项目
git clone <项目地址> lof-fund-tracker
cd lof-fund-tracker

# 2. 运行启动脚本
chmod +x start.sh
./start.sh
```

### 方法二：手动启动

```bash
# 1. 安装依赖
npm install

# 2. 启动服务器
npm start

# 或使用开发模式（自动重启）
npm run dev
```

## 📦 生产环境部署

### 使用PM2（推荐）

```bash
# 1. 全局安装PM2
npm install -g pm2

# 2. 启动应用
pm2 start server.js --name lof-fund-tracker

# 3. 设置开机自启
pm2 startup
pm2 save

# 4. 查看应用状态
pm2 status
pm2 logs lof-fund-tracker

# 5. 常用命令
pm2 restart lof-fund-tracker    # 重启应用
pm2 stop lof-fund-tracker       # 停止应用
pm2 delete lof-fund-tracker     # 删除应用
```

### 使用Systemd

```bash
# 1. 创建服务文件
sudo nano /etc/systemd/system/lof-fund-tracker.service
```

```ini
[Unit]
Description=LOF Fund Tracker Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/lof-fund-tracker
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 2. 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable lof-fund-tracker
sudo systemctl start lof-fund-tracker

# 3. 查看服务状态
sudo systemctl status lof-fund-tracker
sudo journalctl -u lof-fund-tracker -f
```

### 使用Docker

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# 构建镜像
docker build -t lof-fund-tracker .

# 运行容器
docker run -d \
  --name lof-fund-tracker \
  -p 3000:3000 \
  -v $(pwd)/funds.db:/app/funds.db \
  lof-fund-tracker

# 使用Docker Compose
# docker-compose.yml
version: '3.8'
services:
  lof-fund-tracker:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./funds.db:/app/funds.db
    restart: unless-stopped
```

## 🌐 反向代理配置

### Nginx配置

```nginx
# /etc/nginx/sites-available/lof-fund-tracker
server {
    listen 80;
    server_name fund.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/lof-fund-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL证书（Let's Encrypt）

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d fund.example.com

# 自动续期测试
sudo certbot renew --dry-run
```

## 🔧 环境配置

### 生产环境变量

创建 `.env` 文件：

```bash
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置
DATABASE_URL=/opt/lof-fund-tracker/funds.db

# API配置
REQUEST_TIMEOUT=15000
MAX_RETRIES=5

# 安全配置
RATE_LIMIT_WINDOW=900000  # 15分钟
RATE_LIMIT_MAX=100        # 每个IP最大请求数

# 日志配置
LOG_LEVEL=info
LOG_FILE=/var/log/lof-fund-tracker/app.log
```

### 数据库备份

```bash
# 备份脚本 backup.sh
#!/bin/bash
BACKUP_DIR="/backup/funds"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/funds_$DATE.db"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/lof-fund-tracker/funds.db $BACKUP_FILE

# 压缩备份
gzip $BACKUP_FILE

# 删除7天前的备份
find $BACKUP_DIR -name "*.db.gz" -mtime +7 -delete

echo "备份完成: $BACKUP_FILE.gz"

# 添加到cron定时任务
# crontab -e
# 0 2 * * * /opt/lof-fund-tracker/backup.sh
```

## 📊 监控与日志

### 日志管理

```javascript
// 在server.js中添加日志中间件
const fs = require('fs');
const path = require('path');

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 请求日志中间件
app.use((req, res, next) => {
    const log = `${new Date().toISOString()} ${req.method} ${req.url} ${req.ip}\n`;
    fs.appendFileSync(path.join(logDir, 'access.log'), log);
    next();
});

// 错误日志
app.use((err, req, res, next) => {
    const errorLog = `${new Date().toISOString()} ERROR: ${err.message}\n${err.stack}\n`;
    fs.appendFileSync(path.join(logDir, 'error.log'), errorLog);
    res.status(500).json({ error: '服务器内部错误' });
});
```

### 健康检查

```bash
# 健康检查脚本 healthcheck.sh
#!/bin/bash
HEALTH_URL="http://localhost:3000/api/stats"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$response" -eq 200 ]; then
    echo "✅ 服务运行正常"
    exit 0
else
    echo "❌ 服务异常，HTTP状态码: $response"
    exit 1
fi
```

## 🔐 安全建议

### 1. 防火墙配置

```bash
# 只开放必要端口
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

### 2. 限制请求频率

```javascript
// 在server.js中添加限流中间件
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP限制100个请求
    message: '请求过于频繁，请稍后再试'
});

app.use('/api/', limiter);
```

### 3. 输入验证

```javascript
// 验证基金代码格式
function validateFundCode(code) {
    return /^\d{6}$/.test(code);
}

// 验证基金名称
function validateFundName(name) {
    return name && name.length >= 2 && name.length <= 100;
}
```

## 🚨 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看占用端口的进程
   sudo lsof -i :3000
   # 或使用其他端口
   PORT=3001 npm start
   ```

2. **数据库权限问题**
   ```bash
   # 修改数据库文件权限
   chmod 644 funds.db
   chown www-data:www-data funds.db  # 对于Nginx用户
   ```

3. **内存不足**
   ```bash
   # 查看内存使用
   free -h
   # 使用PM2限制内存
   pm2 start server.js --name lof-fund-tracker --max-memory-restart 200M
   ```

4. **网络连接问题**
   ```bash
   # 测试外部API连接
   curl -I https://fund.eastmoney.com
   # 检查防火墙
   sudo ufw status
   ```

### 日志查看

```bash
# 查看应用日志
pm2 logs lof-fund-tracker

# 查看系统日志
sudo journalctl -u lof-fund-tracker -f

# 查看Nginx日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 📈 性能优化

### 1. 启用Gzip压缩

```javascript
// 在server.js中添加
const compression = require('compression');
app.use(compression());
```

### 2. 静态文件缓存

```javascript
app.use(express.static('public', {
    maxAge: '1y',
    etag: true,
    lastModified: true
}));
```

### 3. 数据库索引

```sql
-- 添加索引提高查询性能
CREATE INDEX idx_fund_code ON funds(fund_code);
CREATE INDEX idx_update_time ON fund_prices(update_time);
CREATE INDEX idx_fund_code_time ON fund_prices(fund_code, update_time DESC);
```

### 4. 连接池配置

```javascript
// 使用连接池
const db = new sqlite3.Database('./funds.db', {
    timeout: 5000,
    verbose: process.env.NODE_ENV === 'development'
});
```

## 🔄 更新与维护

### 更新应用

```bash
# 1. 备份数据库
cp funds.db funds.db.backup

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
npm install

# 4. 重启应用
pm2 restart lof-fund-tracker
```

### 数据清理

```sql
-- 清理30天前的历史数据
DELETE FROM fund_prices 
WHERE update_time < datetime('now', '-30 days');

-- 清理无效基金
DELETE FROM funds 
WHERE is_active = 0 
  AND created_at < datetime('now', '-7 days');
```

## 📞 技术支持

### 监控指标
- 响应时间：< 500ms
- 错误率：< 1%
- 内存使用：< 200MB
- CPU使用：< 50%

### 报警设置
- 服务不可用超过5分钟
- 错误率超过5%
- 内存使用超过80%
- 磁盘空间不足

### 联系信息
- 问题反馈：GitHub Issues
- 紧急支持：系统管理员
- 文档更新：README.md

---

**部署完成检查清单**：
- [ ] 应用启动成功
- [ ] 数据库可读写
- [ ] 外部API可访问
- [ ] 防火墙配置正确
- [ ] SSL证书有效
- [ ] 备份机制就绪
- [ ] 监控告警设置
- [ ] 性能测试通过