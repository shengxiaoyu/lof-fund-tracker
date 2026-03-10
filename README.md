# LOF基金查询系统

一个功能完整的LOF基金查询网站，支持实时查询场内净值、场外现价、申购状态，并可自定义添加关注基金。

## ✨ 功能特性

- 🔍 **智能搜索**：支持基金代码/名称模糊搜索
- 📊 **实时数据**：获取场内净值、场外现价、折溢价率
- 📈 **申购状态**：实时显示基金申购状态（开放/暂停/限制）
- ⭐ **关注列表**：自定义添加/删除关注基金
- 🔄 **批量更新**：一键更新所有关注基金数据
- 💾 **数据持久化**：SQLite数据库存储关注列表和历史数据
- 📱 **响应式设计**：适配桌面和移动设备
- 🎨 **现代化界面**：美观直观的用户界面

## 🚀 快速开始

### 1. 安装依赖

```bash
# 进入项目目录
cd lof-fund-tracker

# 安装依赖
npm install
```

### 2. 启动服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 3. 访问网站

打开浏览器访问：http://localhost:3000

## 📁 项目结构

```
lof-fund-tracker/
├── server.js              # 主服务器文件
├── package.json          # 项目依赖配置
├── .env.example          # 环境变量示例
├── public/               # 静态文件
│   └── index.html       # 前端页面
├── funds.db             # SQLite数据库（运行后自动生成）
└── README.md            # 项目说明
```

## 🔧 技术栈

- **后端**：Node.js + Express
- **前端**：HTML5 + CSS3 + JavaScript (原生)
- **数据库**：SQLite3
- **数据抓取**：Axios + Cheerio
- **样式**：CSS Grid + Flexbox
- **部署**：内置HTTP服务器

## 📡 API接口

### 1. 搜索基金
```
GET /api/search?keyword=基金名
```

### 2. 获取基金详情
```
GET /api/fund/:code
```

### 3. 添加关注基金
```
POST /api/fund/add
{
  "code": "161725",
  "name": "招商中证白酒指数(LOF)A"
}
```

### 4. 获取关注列表
```
GET /api/funds
```

### 5. 批量更新基金数据
```
GET /api/funds/update
```

### 6. 获取统计数据
```
GET /api/stats
```

### 7. 删除关注基金
```
DELETE /api/fund/:code
```

### 8. 获取历史数据
```
GET /api/fund/:code/history?limit=30
```

## 🎯 使用示例

### 搜索并添加基金
1. 在左侧搜索框输入基金代码或名称
2. 从搜索结果中选择基金
3. 点击"加入关注"按钮
4. 基金将出现在左侧关注列表中

### 查看基金详情
- 点击关注列表中的基金
- 或直接搜索基金查看详情
- 页面显示：场内现价、基金净值、折溢价率、申购状态

### 管理关注列表
- **添加**：通过搜索添加
- **删除**：点击基金右侧的×按钮
- **刷新**：点击基金详情页的刷新按钮
- **批量更新**：点击"更新所有"按钮

## 🔐 数据源

系统从以下公开数据源获取基金信息：

1. **东方财富网** (fund.eastmoney.com)
   - 基金基本信息
   - 实时净值数据
   - 申购状态信息

2. **天天基金网** (fund.eastmoney.com)
   - 基金详情页面
   - 历史数据

## ⚙️ 配置选项

### 环境变量
复制`.env.example`为`.env`并修改：

```bash
# 服务器端口
PORT=3000

# 数据库路径
DATABASE_URL=./funds.db

# 请求超时时间（毫秒）
REQUEST_TIMEOUT=10000
```

### 修改数据源
在`server.js`中修改`DATA_SOURCES`配置：

```javascript
const DATA_SOURCES = {
    eastmoney: {
        baseUrl: 'https://fund.eastmoney.com',
        search: 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx'
    }
};
```

## 📈 数据更新机制

### 自动更新
- 每次查看基金详情时自动更新
- 支持手动刷新单个基金
- 支持批量更新所有关注基金

### 数据缓存
- 数据库存储关注列表
- 基金价格历史记录
- 每日更新统计

## 🛡️ 安全注意事项

1. **数据来源**：仅使用公开API，不存储敏感信息
2. **请求频率**：避免高频请求，建议间隔至少1秒
3. **错误处理**：完善的错误处理和用户提示
4. **输入验证**：所有输入都经过验证和清理

## 🚀 部署指南

### 本地部署
```bash
npm install
npm start
```

### PM2部署（生产环境）
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name lof-fund-tracker

# 设置开机自启
pm2 startup
pm2 save
```

### Docker部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📱 浏览器兼容性

- Chrome 60+ ✅
- Firefox 55+ ✅
- Safari 11+ ✅
- Edge 79+ ✅
- iOS Safari 11+ ✅
- Android Chrome 60+ ✅

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 支持与反馈

- 问题反馈：GitHub Issues
- 功能建议：GitHub Discussions
- 紧急问题：直接联系开发者

## 🎨 界面预览

### 主要功能区域
1. **顶部导航**：系统标题和简介
2. **左侧边栏**：搜索框、关注列表、统计数据
3. **主内容区**：基金详情展示、操作按钮
4. **消息区域**：操作反馈和提示信息

### 响应式设计
- 桌面端：两栏布局
- 移动端：单栏堆叠布局
- 自适应字体和间距

---

**开始使用**：`npm install && npm start`

**默认地址**：http://localhost:3000

**数据示例**：尝试搜索 "161725"（招商中证白酒指数LOF）