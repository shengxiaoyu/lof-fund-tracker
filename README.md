# LOF基金查询系统

一个实时查询LOF基金场内净值、场外现价、申购状态的Web应用。

## 功能特点
- 📊 实时查询LOF基金数据
- 🔍 场内净值与场外现价对比
- 📈 溢价率计算
- 📱 响应式设计，支持移动端
- 🔄 自动数据更新

## 技术栈
- 后端：Node.js + Express + SQLite
- 前端：HTML5 + CSS3 + JavaScript
- 数据源：东方财富网、天天基金网

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务器
```bash
npm start
```

### 3. 访问应用
打开浏览器访问：http://localhost:3000

## 项目结构
```
lof-fund-tracker/
├── server-noauth.js      # 主服务器文件（无认证版）
├── server.js            # 原始服务器文件
├── server-optimized.js  # 优化版
├── server-enhanced.js   # 增强版
├── package.json         # 依赖配置
├── README.md           # 说明文档
├── public/             # 前端文件
│   ├── index.html          # 基础版首页
│   ├── index-complete.html # 完整版首页
│   ├── index-optimized.html # 优化版首页
│   └── debug.html          # 调试页面
├── backup/             # 备份文件
│   ├── servers/        # 服务器文件备份
│   ├── scripts/        # 脚本文件备份
│   ├── python/         # Python文件备份
│   └── docs/           # 文档备份
└── node_modules/       # 依赖包
```

## API接口
- `GET /` - 首页
- `GET /api/search?keyword=基金名` - 搜索基金
- `GET /api/fund/基金代码` - 获取基金详情
- `GET /api/funds` - 获取所有基金列表
- `POST /api/fund/add` - 添加基金到数据库

## 数据源
- 东方财富网：基金基本信息
- 天天基金网：基金净值数据
- 华宝基金官网：LOF基金详情

## 许可证
MIT License
