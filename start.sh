#!/bin/bash

# LOF基金查询系统启动脚本

echo "========================================="
echo "   LOF基金查询系统启动"
echo "========================================="

# 检查Node.js版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ 需要Node.js 14或更高版本，当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js版本: $(node -v)"

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装"
    exit 1
fi

echo "✅ npm版本: $(npm -v)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已存在"
fi

# 检查数据库
if [ ! -f "funds.db" ]; then
    echo "🗄️  初始化数据库..."
    node -e "
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database('./funds.db');
        db.serialize(() => {
            db.run(\`
                CREATE TABLE IF NOT EXISTS funds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_code TEXT UNIQUE NOT NULL,
                    fund_name TEXT NOT NULL,
                    fund_type TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            \`);
            db.run(\`
                CREATE TABLE IF NOT EXISTS fund_prices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_code TEXT NOT NULL,
                    market_price REAL,
                    net_value REAL,
                    premium_rate REAL,
                    subscription_status TEXT,
                    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (fund_code) REFERENCES funds(fund_code)
                )
            \`);
            console.log('✅ 数据库初始化完成');
        });
        db.close();
    "
else
    echo "✅ 数据库已存在"
fi

# 设置环境变量
if [ ! -f ".env" ]; then
    echo "⚙️  创建环境配置文件..."
    cp .env.example .env
    echo "✅ 环境配置文件已创建"
fi

# 启动服务器
echo "🚀 启动服务器..."
echo ""
echo "========================================="
echo "   LOF基金查询系统运行中"
echo "========================================="
echo "🌐 访问地址: http://localhost:3000"
echo "📊 API接口: http://localhost:3000/api/search?keyword=基金名"
echo "🛑 按 Ctrl+C 停止服务器"
echo "========================================="
echo ""

npm start