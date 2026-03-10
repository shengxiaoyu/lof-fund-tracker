# SSH隧道访问指南

## 🚀 立即访问方案

### 方法1：SSH隧道（最简单有效）

#### 在你的电脑上执行：

**Windows (PowerShell/CMD):**
```powershell
# 建立隧道
ssh -L 8080:localhost:3001 root@43.161.221.10

# 保持窗口打开，然后访问：
# http://localhost:8080
```

**macOS/Linux:**
```bash
# 建立隧道
ssh -L 8080:localhost:3001 root@43.161.221.10

# 保持终端打开，然后访问：
# http://localhost:8080
```

#### 登录信息：
- 用户名：`admin`
- 密码：`9moFkjbVBTrJkd50`

### 方法2：使用autossh（自动重连）

```bash
# 安装autossh
brew install autossh  # macOS
# 或
sudo apt install autossh  # Ubuntu

# 建立持久隧道
autossh -M 0 -f -N -L 8080:localhost:3001 root@43.161.221.10
```

### 方法3：配置SSH config（推荐）

在你的电脑上编辑 `~/.ssh/config`：

```bash
Host lof-fund
    HostName 43.161.221.10
    User root
    LocalForward 8080 localhost:3001
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

然后使用：
```bash
ssh lof-fund
# 访问 http://localhost:8080
```

## 🔧 备选方案

### 如果SSH端口被限制，使用HTTP代理：

```bash
# 使用socat建立HTTP代理
ssh -D 1080 root@43.161.221.10

# 配置浏览器使用SOCKS5代理：
# 地址：localhost
# 端口：1080
```

### 使用浏览器插件：

1. 安装 **FoxyProxy** 或 **SwitchyOmega** 扩展
2. 配置代理到SSH隧道
3. 一键切换

## 📱 移动端访问

### Android：
使用 **Termux** + **SSH**：
```bash
pkg install openssh
ssh -L 8080:localhost:3001 root@43.161.221.10
```

### iOS：
使用 **Termius** 或 **Blink Shell**

## 🛡️ 安全说明

SSH隧道是**最安全**的访问方式：
- ✅ 端到端加密
- ✅ 绕过云防火墙
- ✅ 无需开放公网端口
- ✅ 防止中间人攻击

## 🚨 故障排除

### 问题1：SSH连接失败
```bash
# 检查SSH服务
ssh -v root@43.161.221.10

# 尝试不同端口
ssh -p 2222 -L 8080:localhost:3001 root@43.161.221.10
```

### 问题2：端口被占用
```bash
# 使用不同本地端口
ssh -L 8888:localhost:3001 root@43.161.221.10
# 访问 http://localhost:8888
```

### 问题3：权限问题
确保你有服务器的SSH访问权限。

## 🎯 一键脚本

### Windows (保存为 `lof-tunnel.bat`):
```batch
@echo off
echo 正在建立LOF基金查询系统隧道...
ssh -L 8080:localhost:3001 root@43.161.221.10
pause
```

### macOS/Linux (保存为 `lof-tunnel.sh`):
```bash
#!/bin/bash
echo "正在建立LOF基金查询系统隧道..."
ssh -L 8080:localhost:3001 root@43.161.221.10
```

## 📊 访问流程

1. **建立隧道** → `ssh -L 8080:localhost:3001 root@43.161.221.10`
2. **打开浏览器** → `http://localhost:8080`
3. **登录系统** → 用户名 `admin`，密码 `9moFkjbVBTrJkd50`
4. **开始使用** → 搜索、查看、管理LOF基金

## 🔄 永久解决方案

### 长期建议：
1. **联系云服务商**开通3001和3444端口
2. **配置安全组规则**允许这两个端口
3. **使用域名+CDN**如Cloudflare

### 临时方案：
SSH隧道是最可靠的临时访问方式。

---

**立即开始**：打开终端，运行 `ssh -L 8080:localhost:3001 root@43.161.221.10`