# 在线版架构设计

## 1. 目标

在现有离线 Electron 桌面应用基础上，增加可选的在线模式：用户可以选择登录 Supabase 账号来使用云端数据库，也可以跳过登录继续使用当前的纯离线 SQLite 模式。

核心原则：

- **离线优先**：不登录时一切行为与现在完全相同，不做任何降级
- **用户选择**：登录 / 跳过登录由用户主动决定，不强制
- **渐进增强**：登录后获得云同步、多设备数据一致、备份恢复能力

## 2. 用户体验流程

### 首次启动

```
应用启动 → 登录页
  ├── 输入邮箱 + 密码 → 登录 → 进入在线模式（Supabase）
  ├── 点击"跳过，离线使用" → 进入离线模式（SQLite，当前行为）
  └── 注册账号 → 验证邮箱 → 登录 → 进入在线模式
```

### 已登录用户再次启动

```
应用启动 → 检测到已有 session → 自动恢复登录 → 进入在线模式
```

### 离线用户切换为在线

```
侧边栏 → 点击"登录"按钮 → 登录页 → 登录成功 → 询问是否迁移本地数据 → 进入在线模式
```

### 在线用户退出

```
侧边栏 → 点击头像/设置 → 退出登录 → 确认 → 恢复离线模式
```

## 3. 技术选型

| 项目 | 选择 | 备注 |
|------|------|------|
| BaaS | Supabase | 开源，PostgreSQL + Auth + RLS 开箱即用 |
| Auth 方式 | Email + Password | 最简实现，匹配应用风格；后续可扩展 OAuth |
| 客户端 SDK | `@supabase/supabase-js` | 官方 JS SDK，支持浏览器和 Node.js |
| 主进程集成 | Node.js (`@supabase/supabase-js` 同构) | 在 main 进程中初始化 Supabase client |
| 渲染进程集成 | React Context + hook | `AuthContext` 控制全局 auth 状态 |
| 环境变量 | `.env` | `SUPABASE_URL` + `SUPABASE_ANON_KEY`，构建时注入 |

## 4. 架构设计

### 4.1 运行时模式

```typescript
type AppRuntimeMode = 'offline' | 'online'
```

模式由 auth state 决定：

- `offline`：未登录或用户选择跳过 → SQLite 数据路径
- `online`：已登录且 session 有效 → Supabase 数据路径

模式切换通过 `AuthContext` 全局广播，所有数据消费方自动响应。

### 4.2 新增分层

```
┌─────────────────────────────────────────────┐
│                   Renderer                   │
│  LoginPage  AuthContext  AppShell(改)       │
├─────────────────────────────────────────────┤
│              Preload / IPC                   │
│  auth:login  auth:logout  auth:getSession   │
├─────────────────────────────────────────────┤
│               Main Process                   │
│  ┌─────────────────────────────────────┐    │
│  │  authService (Supabase Auth)        │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  Repository Layer (mode-aware)      │    │
│  │  ┌──────────────┐ ┌──────────────┐  │    │
│  │  │ OfflineRepo  │ │ OnlineRepo   │  │    │
│  │  │ (SQLite)     │ │ (Supabase)   │  │    │
│  │  └──────────────┘ └──────────────┘  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 4.3 仓库抽象

当前已有 `AssetSnapshotRepository`、`watchlistRepository`、`PortfolioPositionStore` 等仓库。每个仓库增加在线实现：

```
src/main/repositories/
├── assetSnapshotRepository.ts       # 现有（SQLite）
├── assetSnapshotOnlineRepository.ts # 新增（Supabase）
├── watchlistRepository.ts           # 现有（SQLite）
├── watchlistOnlineRepository.ts     # 新增（Supabase）
└── ...
```

通过工厂函数根据运行模式返回对应实现：

```typescript
function getAssetSnapshotRepository(mode: AppRuntimeMode) {
  return mode === 'online' ? new AssetSnapshotOnlineRepository() : new AssetSnapshotRepository()
}
```

## 5. 数据库设计（Supabase）

### 5.1 表结构

与现有 SQLite 表一一对应，增加 `user_id` 字段：

```sql
-- 自选资产
CREATE TABLE watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, asset_key)
);

-- 持仓记录
CREATE TABLE portfolio_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL,
  shares REAL NOT NULL,
  avg_cost REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 资产快照缓存
CREATE TABLE asset_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, asset_key)
);

-- 组合风险快照缓存
CREATE TABLE portfolio_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cache_key)
);

-- 应用设置
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, key)
);
```

### 5.2 RLS 策略

所有表启用 Row Level Security，每个用户只能读写自己的数据：

```sql
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_risk_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own data" ON watchlist_items
  FOR ALL USING (auth.uid() = user_id);

-- ... 其他表同理
```

## 6. 认证流程

### 6.1 IPC 通道

```
auth:login             { email, password } → { session }
auth:register          { email, password } → { session }
auth:logout            void → void
auth:getSession        void → { session | null }
auth:update-password   { newPassword } → void
auth:onAuthChange      callback → unsubscribe
```

### 6.2 主进程 authService

```typescript
// src/main/infrastructure/supabase/authService.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const authService = {
  login(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password })
  },
  register(email: string, password: string) {
    return supabase.auth.signUp({ email, password })
  },
  logout() {
    return supabase.auth.signOut()
  },
  getSession() {
    return supabase.auth.getSession()
  },
  updatePassword(newPassword: string) {
    return supabase.auth.updateUser({ password: newPassword })
  },
  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
}
```

### 6.3 渲染进程 AuthContext

```typescript
// src/renderer/src/contexts/AuthContext.tsx
type AuthState = {
  mode: 'offline' | 'online'
  session: Session | null
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  skipLogin: () => void
}
```

## 7. 登录页设计

### 7.1 页面布局

参考当前 DashboardPage 和 StockDetailPage 的设计语言：

```
┌────────────────────────────────────────────┐
│                                            │
│         [AppLogo / 收息佬]                  │
│                                            │
│     ┌──────────────────────────┐           │
│     │                          │           │
│     │  邮箱                    │           │
│     │  [___________________]   │           │
│     │                          │           │
│     │  密码                    │           │
│     │  [___________________]   │           │
│     │                          │           │
│     │  确认密码  ← 注册时显示   │           │
│     │  [___________________]   │           │
│     │                          │           │
│     │  [      登  录      ]    │           │
│     │                          │           │
│     │  [    注册新账号    ]    │           │
│     │                          │           │
│     │  ── 或 ──               │           │
│     │                          │           │
│     │  [  跳过，离线使用  ]    │           │
│     │                          │           │
│     └──────────────────────────┘           │
│                                            │
│     使用在线模式可以多设备同步数据           │
│     离线模式数据仅存储在当前设备             │
│                                            │
└────────────────────────────────────────────┘
```

### 7.2 设计规范

- 居中布局，使用 `AppCard`（`variant="borderless"`，`className="glass-card"`）包裹表单
- 表单控件使用 Ant Design `Input` / `Button`，保持与 `AssetSearchPage` 一致的样式
- 主操作按钮使用 `ledger-primary-button`
- 次要操作（跳过）使用 `ledger-secondary-button`
- 背景使用 `ledger-page` 相同的底色
- 登录页同时也作为路由守卫：未登录用户进入需要登录的路由时自动重定向到此页

## 8. 路由设计

```
/login          → 登录页（所有未登录用户的入口）
/               → Dashboard（离线模式直接进入，在线模式需登录）
/stock-detail/* → 资产详情（离线直接可看，在线需登录）
/watchlist      → 自选列表
/comparison     → 对比分析
/backtest       → 回测
/user-center    → 用户中心（在线模式专属：修改密码、数据同步、退出登录）
/settings       → 设置（新增：账号管理、同步设置、数据迁移）
```

路由守卫逻辑：

```typescript
// 在线模式下：未登录 → 重定向到 /login
// 离线模式下：所有路由直接可用
function useRouteGuard() {
  const { mode, loading } = useAuth()
  
  if (mode === 'offline') return 'unlocked'
  if (loading) return 'checking'
  if (mode === 'online' && session) return 'unlocked'
  return 'locked'
}
```

## 9. 数据迁移策略

当用户从离线切换为在线时：

```
┌──────────────────────────────────────┐
│  检测到本地有数据而云端为空            │
│                                      │
│  "检测到你有本地持仓数据，              │
│   是否迁移到云端？"                    │
│                                      │
│  [  迁移到云端  ]  [ 保持本地  ]     │
│                                      │
│  迁移后本地数据保留，云端新增副本       │
└──────────────────────────────────────┘
```

迁移流程：

1. 读取 SQLite 本地全部数据（自选、持仓、设置）
2. 逐条插入 Supabase（使用 `user_id` 绑定）
3. 迁移完成后标记 `migration_completed_at`
4. 后续操作双写：写入 Supabase + 写入本地 SQLite

## 9.5 数据同步策略

用户中心提供三种同步方向，每种方向有明确的语义：

| 方向 | 策略 | 效果 |
|------|------|------|
| **仅推送（Push）** | 先 `DELETE` 云端该用户所有数据，再 `INSERT` 本地全量 | 云端 = 本地的精确镜像，不留孤立记录 |
| **仅拉取（Pull）** | 先清空本地数据，再从云端全量写入 | 本地 = 云端的精确镜像 |
| **双向同步（Bidirectional）** | 分别读取双方数据，按 key 合并后再写回 | 合并结果，不丢失任何一方的数据 |

双向合并逻辑：

- **自选**：按 `asset_key` 去重，取并集（云端优先覆盖同名 key）
- **持仓**：
  - 仅本地有的 → 推送到云端
  - 仅云端有的 → 拉取到本地
  - 两边都有同一 `id` → 比较 `updatedAt`，保留更新的一方

## 10. 离线 / 在线切换行为

| 场景 | 行为 |
|------|------|
| 离线模式下操作 | 完全使用 SQLite，无任何网络请求 |
| 在线模式下操作 | 数据写入 Supabase，本地 SQLite 同步写入作为缓存 |
| 在线模式下网络断开 | 降级到本地 SQLite，UI 显示"离线"徽标 |
| 网络恢复 | 自动同步本地变更到 Supabase（基于 updated_at 时间戳冲突处理） |
| 在线模式退出登录 | 保留本地 SQLite 数据，清空 auth session，UI 恢复离线模式 |

## 11. 侧边栏调整

在 `AppShell` 底部新增用户状态区域：

```
┌────────────────────┐
│  投资组合           │
│  股息               │
│  自选               │
│  数据分析           │
│  回测               │
│                    │
│  ────────────────  │
│                    │
│  [头像] user@...    │  ← 在线模式：显示头像 + 邮箱，点击进入用户中心
│  在线 · 已同步      │
│                    │
│   或                │
│                    │
│  [登录账号]         │  ← 离线模式：显示登录入口
│  离线模式           │
│                    │
└────────────────────┘
```

用户中心页面（`UserCenterPage`）包含：

1. 账号信息展示（邮箱、登录时间）
2. 修改密码（需输入新密码 + 确认新密码）
3. 数据同步操作（推送 / 拉取 / 双向同步）
4. 同步状态展示
5. 退出登录

## 12. 环境变量与构建

```bash
# .env (不提交到 git)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...

# 构建时通过 Vite define 注入到 preload 和 renderer
```

- `.env` 加入 `.gitignore`
- `.env.example` 提供模板
- 构建脚本通过 `--config` 或环境变量区分 dev/prod

## 13. 实施顺序

### 第一阶段：基础设施 + 登录页（约 1-2 天）

1. 搭建 Supabase 项目，创建数据库表 + RLS
2. 添加 `@supabase/supabase-js` 依赖
3. 创建 `authService.ts`（主进程 Supabase client）
4. 注册 IPC 通道：`auth:login`、`auth:logout`、`auth:getSession`
5. HTTP 路由：`/api/auth/login`、`/api/auth/logout`
6. 创建 `AuthContext`（渲染进程）
7. 创建 `LoginPage`（路由 `/login`）
8. 实现路由守卫
9. 调整 `AppShell` 侧边栏（底部 auth 状态区）

### 第二阶段：在线数据仓库（约 1-2 天）

1. 创建 `OnlineAssetSnapshotRepository`
2. 创建 `OnlineWatchlistRepository`
3. 创建 `OnlinePortfolioPositionStore`
4. 实现工厂函数按模式切换仓库
5. 在线模式 CRUD 对接 Supabase
6. 本地 SQLite 同步写入作为缓存

### 第三阶段：数据迁移与同步（约 1 天）

1. 实现本地 → 云端数据迁移流程
2. 迁移确认 UI
3. 网络断线检测与降级处理
4. 网络恢复后自动同步
5. SyncStatus 徽标组件

### 第四阶段：收尾与测试（约 0.5 天）

1. 离线模式回归测试（确保无影响）
2. 在线模式端到端测试
3. 文档更新（SDD、ARCHITECTURE、用户手册）

## 14. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Supabase 服务不可用 | 在线模式不可用 | 自动降级到离线 SQLite，UI 提示 |
| 数据同步冲突 | 多设备数据不一致 | 以 `updated_at` 最后写入为准，先到先得 |
| 本地数据迁移失败 | 用户数据丢失风险 | 迁移前备份本地 SQLite 文件；迁移过程只读数据 |
| 离线用户升级后仓库接口不兼容 | 离线模式崩坏 | 仓库抽象保持向后兼容；离线实现完全不动 |

## 15. 非目标（本阶段不实现）

- 实时多设备协作（WebSocket / Realtime）
- OAuth 第三方登录（Google / GitHub / 微信）
- 端到端加密
- 文件导入/导出在线同步
- 订阅计费与付费墙
- Web 版本（浏览器独立运行不使用 Electron）

## 16. 后续升级路径

```
v1.0 离线版（当前）
  │
  ▼
v1.5 在线版（本文档）
  │  Auth + CRUD + 数据迁移
  │
  ▼
v2.0 Web 版
  │  独立 Web 前端（无 Electron）+ Supabase 直连
  │  纯浏览器运行，不需桌面端
  │
  ▼
v2.5 多端同步增强
     Realtime 订阅 + 协作自选池 + 社区分享
```
