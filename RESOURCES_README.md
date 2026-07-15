# 资源管理系统

这是一个基于 NestJS 和 MySQL 的资源管理系统，用于管理和提供 SVG/PNG 资源给前端使用。

## 功能特性

- ✅ 自动扫描外部资源文件夹 (`E:\兼职\svgs-download\py`)
- ✅ 按文件夹自动分类管理
- ✅ 支持 SVG 和 PNG 文件配对
- ✅ RESTful API 接口
- ✅ 静态文件服务
- ✅ 搜索和筛选功能
- ✅ 分页支持

## 项目结构

```
src/resources/
├── resources.module.ts          # 资源模块
├── resources.controller.ts      # 资源控制器
├── resources.service.ts         # 资源服务
├── dto/
│   └── query-resources.dto.ts   # 查询参数验证
├── entities/
│   ├── resource.entity.ts       # 资源实体
│   └── resource-category.entity.ts # 资源类别实体
└── scanner/
    └── resource-scanner.service.ts # 资源扫描服务
```

## 数据库设计

### 资源类别表 (resource_categories)
- `id` - 主键
- `name` - 类别名称
- `slug` - URL友好的标识符
- `folderName` - 文件夹名称
- `resourceCount` - 资源数量
- `isActive` - 是否启用

### 资源表 (resources)
- `id` - 主键
- `name` - 资源名称
- `slug` - URL友好的标识符
- `categoryId` - 类别ID
- `fileName` - 文件名
- `relativePath` - 相对路径
- `svgContent` - SVG内容
- `hasPng` - 是否有PNG文件
- `tags` - 标签
- `sortOrder` - 排序
- `isActive` - 是否启用

## API 接口

### 资源查询
- `GET /api/resources` - 获取资源列表（支持分页、搜索、筛选）
- `GET /api/resources/categories` - 获取所有类别
- `GET /api/resources/category/:slug` - 获取指定类别的资源
- `GET /api/resources/search?q=keyword` - 搜索资源
- `GET /api/resources/:id` - 获取单个资源详情
- `GET /api/resources/:id/content` - 获取资源内容

### 管理接口（需要认证）
- `POST /api/resources/scan` - 扫描所有资源
- `POST /api/resources/scan/:category` - 扫描指定类别
- `GET /api/resources/stats/overview` - 获取统计信息

### 静态文件访问
- `GET /resources/:relativePath` - 访问静态文件（SVG/PNG）

## 查询参数

### 资源列表查询参数
- `category` - 类别筛选（可选）
- `search` - 搜索关键词（可选）
- `page` - 页码（默认1）
- `limit` - 每页数量（默认40，最大100）
- `sortBy` - 排序字段（默认createdAt）
- `sortOrder` - 排序方向（ASC/DESC，默认DESC）

## 使用示例

### 1. 获取所有资源
```bash
GET /api/resources?page=1&limit=20
```

### 2. 按类别筛选
```bash
GET /api/resources?category=lego&page=1&limit=20
```

### 3. 搜索资源
```bash
GET /api/resources?search=pokemon&page=1&limit=20
```

### 4. 获取所有类别
```bash
GET /api/resources/categories
```

### 5. 访问静态文件
```bash
GET /resources/lego/lego-1.svg
GET /resources/pokemon/pokemon-p2-2.png
```

## 前端集成

### 修改 SvgDrawer.vue

将原来的模拟数据替换为API调用：

```javascript
// 替换 generateSvgLibrary() 函数
async function loadResources() {
  try {
    const response = await fetch('/api/resources', {
      method: 'GET',
      params: {
        category: selectedCategory.value === 'All' ? undefined : selectedCategory.value,
        search: searchQuery.value,
        page: currentPage.value,
        limit: PAGE_SIZE
      }
    });
    
    const data = await response.json();
    items.value = data.items.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category.name,
      content: item.svgContent,
      svgUrl: `/resources/${item.relativePath}`,
      pngUrl: item.hasPng ? `/resources/${item.relativePath.replace('.svg', '.png')}` : null
    }));
  } catch (error) {
    console.error('加载资源失败:', error);
  }
}
```

## 部署和配置

### 1. 环境变量
确保在 `.env` 文件中配置数据库连接：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database
```

### 2. 启动应用
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run start:dev

# 构建生产版本
npm run build
npm run start:prod
```

### 3. 初始数据扫描
启动应用后，需要先扫描资源文件夹：

```bash
# 使用 API 扫描（需要认证）
POST /api/resources/scan

# 或者直接访问数据库手动触发
```

## 测试

使用提供的测试脚本验证功能：

```bash
# 安装 axios（如果还没有安装）
npm install axios

# 运行测试脚本
node test-resources.js
```

## 性能优化建议

1. **数据库索引**：确保在 `categoryId`、`name`、`slug` 字段上建立索引
2. **缓存机制**：可以添加 Redis 缓存热门资源和类别
3. **CDN**：静态文件可以配置 CDN 加速
4. **懒加载**：SVG 内容可以按需加载

## 扩展功能

未来可以考虑添加：
- 资源标签系统
- 资源收藏功能
- 使用统计
- 批量操作
- 资源版本管理
- 多语言支持

## 故障排除

### 常见问题

1. **静态文件访问失败**
   - 检查 `E:\兼职\svgs-download\py` 路径是否存在
   - 确认文件权限设置正确

2. **数据库连接失败**
   - 检查数据库服务是否运行
   - 确认连接参数配置正确

3. **扫描失败**
   - 确认资源文件夹结构正确
   - 检查文件夹权限

## 联系方式

如有问题，请联系开发团队。