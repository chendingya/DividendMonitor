# Android 移动端响应式基础（P0/L1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让现有 Web 界面在 ≤900px 窄屏（手机/平板竖屏）可用：补齐抽屉导航（当前 ≤900px 侧边栏 `display:none` 后无任何导航入口）、安全区适配、表格横向兜底，桌面端零回归。

**Architecture:** 不引入 Capacitor（那是 P2）。本阶段只改渲染层：新增 `useIsMobile` hook（与 CSS 900px 断点对齐）、`AppShell.tsx` 加抽屉导航分支（antd Drawer 复用现有 Menu 与侧边栏底部）、`theme.css` 末尾追加"移动端适配"区块。所有新 CSS 规则位于 `max-width` 媒体查询内，桌面宽度下不生效。

**Tech Stack:** React 18 + antd 5（Drawer/Menu，零新增依赖）+ 原生 CSS 媒体查询 + Vitest（node 环境，纯函数测试；仓库无 DOM 测试设施，组件任务的验证走 typecheck + 浏览器预览目检）。

**Spec:** `docs/ANDROID-PORT-ASSESSMENT.md`（§2.4 响应式现状审计、§6 路线图 P0 行）

## Global Constraints

- 断点以 CSS 现有值为准：导航断点 900px、细节断点 720px，均为**含边界**（`max-width: 900px` 命中 900）。
- JS 断点必须与 CSS 断点一致：`MOBILE_BREAKPOINT_PX = 900`，判定为 `width <= 900`。
- **桌面零回归**：新 CSS 规则必须位于 `@media (max-width: ...)` 内；新增 DOM 元素（汉堡按钮）须在 >900px 时 `display: none`。
- 遵循仓库 Git 约定（AGENTS.md）：分支 `feat/mobile-responsive-foundation`，conventional commits 中文描述，**不加 Co-Authored-By**。
- 每个 TS 任务后运行 `npm run typecheck`；涉及测试的运行 `npx vitest run tests/renderer/useIsMobile.test.ts`。
- P0 范围禁区：不改 `src/main/`、`shared/`、不新增 npm 依赖、不动 `desktopApi.ts` 运行时选择逻辑。

---

### Task 1: 断点工具与 useIsMobile hook（TDD）

**Files:**
- Create: `src/renderer/src/hooks/useIsMobile.ts`
- Test: `tests/renderer/useIsMobile.test.ts`

**Interfaces:**
- Consumes: 无（纯新增）
- Produces: `MOBILE_BREAKPOINT_PX: number`（值 900）、`resolveIsMobile(width: number, breakpointPx?: number): boolean`、`useIsMobile(breakpointPx?: number): boolean`，导入路径 `@renderer/hooks/useIsMobile`。Task 3 的 AppShell 依赖 `useIsMobile()`。

- [ ] **Step 1: 建分支并写失败测试**

```bash
git checkout -b feat/mobile-responsive-foundation
```

创建 `tests/renderer/useIsMobile.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { MOBILE_BREAKPOINT_PX, resolveIsMobile } from '@renderer/hooks/useIsMobile'

describe('resolveIsMobile', () => {
  it('390px 手机宽度判定为移动端', () => {
    expect(resolveIsMobile(390)).toBe(true)
  })

  it('900px 判定为移动端，与 CSS @media (max-width: 900px) 边界一致', () => {
    expect(resolveIsMobile(900)).toBe(true)
  })

  it('901px 判定为桌面端', () => {
    expect(resolveIsMobile(901)).toBe(false)
  })

  it('支持自定义断点（含边界）', () => {
    expect(resolveIsMobile(721, 720)).toBe(false)
    expect(resolveIsMobile(720, 720)).toBe(true)
  })

  it('默认断点常量为 900，与 theme.css 侧边栏隐藏断点一致', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(900)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/useIsMobile.test.ts`
Expected: FAIL，报错 `Failed to resolve import "@renderer/hooks/useIsMobile"`（模块不存在）

- [ ] **Step 3: 最小实现**

创建 `src/renderer/src/hooks/useIsMobile.ts`：

```ts
import { useEffect, useState } from 'react'

/** 与 theme.css 中 @media (max-width: 900px) 的侧边栏隐藏断点保持一致（含边界） */
export const MOBILE_BREAKPOINT_PX = 900

export function resolveIsMobile(width: number, breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  return width <= breakpointPx
}

export function useIsMobile(breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : resolveIsMobile(window.innerWidth, breakpointPx)
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const sync = () => setIsMobile(resolveIsMobile(window.innerWidth, breakpointPx))
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [breakpointPx])

  return isMobile
}
```

- [ ] **Step 4: 运行测试确认通过 + typecheck**

Run: `npx vitest run tests/renderer/useIsMobile.test.ts && npm run typecheck`
Expected: 5 个测试全 PASS；tsc 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useIsMobile.ts tests/renderer/useIsMobile.test.ts
git commit -m "feat(ui): 新增 useIsMobile 断点工具与单元测试"
```

---

### Task 2: viewport 安全区适配

**Files:**
- Modify: `src/renderer/index.html:5`
- Modify: `src/renderer/src/styles/theme.css`（末尾追加）

**Interfaces:**
- Consumes: 无
- Produces: `theme.css` 末尾的"移动端适配"注释区块头（Task 3/4/5 的 CSS 都追加在此区块内）

- [ ] **Step 1: 修改 viewport meta**

`src/renderer/index.html` 第 5 行，原：

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

改为：

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: theme.css 末尾追加移动端区块**

在 `src/renderer/src/styles/theme.css` 文件末尾追加：

```css
/* ============================================================
   移动端适配（P0/L1）— 设计见 docs/ANDROID-PORT-ASSESSMENT.md
   规则全部位于 ≤900px 媒体查询内，桌面宽度不生效；
   max() 保证无安全区环境下维持最小内边距
   ============================================================ */

@media (max-width: 900px) {
  .ledger-topbar-row {
    padding-left: max(18px, env(safe-area-inset-left));
    padding-right: max(18px, env(safe-area-inset-right));
  }

  .ledger-canvas {
    padding-left: max(20px, env(safe-area-inset-left));
    padding-right: max(20px, env(safe-area-inset-right));
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 3: 目检**

Run: `npm run dev:browser-preview`，浏览器打开 `http://127.0.0.1:8192`：
- DevTools 设备模拟 390×844：页面内容不被边缘裁切，左右留白正常（≥18px）
- 桌面 1440px：与改动前无差异

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/src/styles/theme.css
git commit -m "feat(ui): viewport 安全区适配（viewport-fit=cover + env 安全区内边距）"
```

---

### Task 3: AppShell 窄屏抽屉导航（核心：修复 ≤900px 无导航）

**Files:**
- Modify: `src/renderer/src/layouts/AppShell.tsx`
- Modify: `src/renderer/src/styles/theme.css`（移动端区块内追加）

**Interfaces:**
- Consumes: `useIsMobile()`（Task 1）
- Produces: AppShell 对外导出不变（`export function AppShell({ children }: { children: ReactNode })`）；内部新增行为——≤900px 显示汉堡按钮，点击打开 antd Drawer，内含与侧边栏相同的 Menu 与底部用户区，路由变化自动关闭

- [ ] **Step 1: 修改 import**

`AppShell.tsx` 第 3 行 antd 导入加 `Drawer`，并新增 hook 导入：

```tsx
import { Drawer, Menu, message } from 'antd'
import { useIsMobile } from '@renderer/hooks/useIsMobile'
```

- [ ] **Step 2: 组件内加状态、路由联动与共享点击处理**

在 `AppShell` 函数体内（`const [, messageHolder] = message.useMessage()` 与 `const [topbarKeyword, setTopbarKeyword] = useState('')` 之后）加：

```tsx
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)

  // 路由变化后自动收起抽屉（菜单点击 / 返回键均触发）
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }
```

- [ ] **Step 3: 抽离侧边栏底部为共享函数**

将现有 `<div className="ledger-sidebar-footer">`（约 365–414 行）内部的完整 JSX 移入组件内函数（内容原样移动，不改动任何类名与逻辑），`<aside>` 中的原位置改为调用：

```tsx
  function renderSidebarFooter() {
    return mode === 'online' && session ? (
      <>
        <div
          className="ledger-user-chip is-clickable"
          onClick={() => navigate('/user-center')}
        >
          <div className="ledger-user-avatar is-online">
            {(session.user.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="ledger-user-name is-truncated">
              {session.user.email ?? '在线用户'}
            </div>
            <div className="ledger-user-tier is-online">在线 · 已同步</div>
          </div>
        </div>
        <button
          type="button"
          className="ledger-help-link is-logout"
          onClick={() => { void logout() }}
        >
          退出登录
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          className="ledger-upgrade-button"
          onClick={() => navigate('/user-center')}
        >
          登录 / 注册
        </button>
        <button type="button" className="ledger-help-link">
          帮助中心
        </button>
        <div
          className="ledger-user-chip is-clickable"
          onClick={() => navigate('/user-center')}
        >
          <div className="ledger-user-avatar" />
          <div>
            <div className="ledger-user-name">离线模式</div>
            <div className="ledger-user-tier is-offline">数据仅存于本机</div>
          </div>
        </div>
      </>
    )
  }
```

`<aside>` 内原 footer 区块改为：

```tsx
        <div className="ledger-sidebar-footer">
          {renderSidebarFooter()}
        </div>
```

同时把 `<aside>` 里 Menu 的 `onClick={({ key }) => navigate(key)}` 改为 `onClick={handleMenuClick}`。

- [ ] **Step 4: 顶栏加汉堡按钮**

在 `<div className="ledger-topbar-row">` 内、`ledger-topbar-search-wrap` 之前加：

```tsx
            {isMobile ? (
              <button
                type="button"
                className="ledger-mobile-nav-toggle"
                aria-label="打开导航菜单"
                onClick={() => setNavOpen(true)}
              >
                <span className="ledger-mobile-nav-toggle-bar" />
                <span className="ledger-mobile-nav-toggle-bar" />
                <span className="ledger-mobile-nav-toggle-bar" />
              </button>
            ) : null}
```

- [ ] **Step 5: 根容器末尾加 Drawer**

在 `<div className="ledger-shell">` 内、`</div>`（ledger-main 结束后）之前加：

```tsx
        <Drawer
          placement="left"
          width={264}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          title={
            <div className="ledger-sidebar-brand">
              <div className="ledger-sidebar-mark">息</div>
              <div>
                <div className="ledger-sidebar-title">收息佬</div>
                <div className="ledger-sidebar-subtitle">财富简报</div>
              </div>
            </div>
          }
          styles={{
            body: {
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }
          }}
        >
          <nav className="ledger-sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
            <Menu
              mode="inline"
              items={menuItems}
              selectedKeys={[selectedKey]}
              onClick={handleMenuClick}
              style={{ background: 'transparent', borderInlineEnd: 'none' }}
            />
          </nav>
          <div className="ledger-sidebar-footer">{renderSidebarFooter()}</div>
        </Drawer>
```

- [ ] **Step 6: theme.css 移动端区块内追加按钮与抽屉样式**

```css
/* 窄屏抽屉导航触发按钮（仅 ≤900px 显示） */
.ledger-mobile-nav-toggle {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ledger-mobile-nav-toggle-bar {
  display: block;
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}

@media (min-width: 901px) {
  .ledger-mobile-nav-toggle {
    display: none;
  }
}

/* 抽屉内复用侧边栏底部样式的微调（静态定位 + 分隔线） */
.ant-drawer .ledger-sidebar-footer {
  position: static;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}
```

- [ ] **Step 7: typecheck + 目检**

Run: `npm run typecheck`
Expected: 无错误

目检（`npm run dev:browser-preview`）：
- 390×844：汉堡按钮出现在顶栏左侧；点击打开抽屉；点"自选"跳转且抽屉自动关闭；点遮罩关闭；抽屉底部用户区正常显示
- 1440px：无汉堡按钮，侧边栏原样，无任何视觉差异
- 901px 与 900px 边界：901 显示侧边栏无汉堡；900 隐藏侧边栏出现汉堡（与 CSS 断点一致）

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/layouts/AppShell.tsx src/renderer/src/styles/theme.css
git commit -m "fix(ui): AppShell 窄屏抽屉导航，修复 900px 以下无导航入口"
```

---

### Task 4: 顶栏搜索与面包屑 720px 窄屏适配

**Files:**
- Modify: `src/renderer/src/styles/theme.css`（移动端区块内追加）

**Interfaces:**
- Consumes: 无（纯 CSS，作用于 Task 3 已有的 DOM 结构）
- Produces: 无

- [ ] **Step 1: 追加 720px 顶栏/面包屑规则**

```css
/* 顶栏与面包屑窄屏适配 */
@media (max-width: 720px) {
  .ledger-topbar-row {
    gap: 10px;
  }

  .ledger-topbar-search-wrap {
    max-width: none;
    flex: 1 1 auto;
    min-width: 0;
  }

  .ledger-topbar-search {
    width: 100%;
    min-width: 0;
  }

  .ledger-topbar-actions {
    flex-shrink: 0;
  }

  .ledger-breadcrumb-row {
    gap: 8px;
  }

  .ledger-back-button {
    flex-shrink: 0;
  }

  .ledger-breadcrumbs {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ledger-breadcrumbs::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 2: 目检**

390×844：搜索框占满顶栏剩余宽度、回车搜索可用；面包屑过长时横向滑动、无滚动条；返回按钮不被挤压。
1440px：无差异。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/theme.css
git commit -m "feat(ui): 顶栏搜索与面包屑 720px 窄屏适配"
```

---

### Task 5: 数据行窄屏横向滚动兜底

**Files:**
- Modify: `src/renderer/src/styles/theme.css`（移动端区块内追加）

**Interfaces:**
- Consumes: 无（`.ledger-data-card/.ledger-data-head/.ledger-data-row` 为现有选择器）
- Produces: 无

- [ ] **Step 1: 追加 720px 数据行兜底规则**

```css
/* 数据行窄屏横向滚动兜底（保持列结构完整，避免挤压错位） */
@media (max-width: 720px) {
  .ledger-data-card {
    overflow-x: auto;
  }

  .ledger-data-head,
  .ledger-data-row {
    min-width: 640px;
  }
}
```

- [ ] **Step 2: 目检**

390×844：自选/投资组合的数据行保持列对齐，卡片内可左右滑动；列头与数据行滚动同步（同一滚动容器）。
1440px：无差异。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/theme.css
git commit -m "feat(ui): 数据行窄屏横向滚动兜底"
```

---

### Task 6: 全量回归与合并

**Files:**
- 无新增/修改（验证与 Git 操作）

**Interfaces:**
- Consumes: Task 1–5 的全部产出
- Produces: `main` 分支上的 P0 增量

- [ ] **Step 1: 全量测试与类型检查**

Run: `npm run typecheck && npm test`
Expected: tsc 无错误；420+ 测试全绿（本阶段未动 main/shared，理论上零影响，跑全量兜底）

- [ ] **Step 2: 桌面回归目检**

`npm run dev`（Electron 桌面）或 `dev:browser-preview` 1920px 宽：
侧边栏、顶栏搜索、面包屑、数据表格、图表导出按钮与改动前一致（重点：汉堡按钮不存在、无横向滚动条、无安全区 padding 变化）。

- [ ] **Step 3: 按 AGENTS.md 约定合并回 main 并推送**

```bash
git checkout main
git merge --no-ff feat/mobile-responsive-foundation -m "merge: feat/mobile-responsive-foundation 合并回 main（移动端响应式基础 P0）"
git push origin main
```

注：推送偶发 502 时等 30–60 秒重试，不要中断。

---

## Self-Review 记录

- **Spec 覆盖**：评估文档 §2.4 列出的缺口——无导航（Task 3）、安全区（Task 2）、表格兜底（Task 5）、顶栏/面包屑（Task 4）、断点一致性工具（Task 1）——全部有对应任务；ECharts 触控与密度属 P3（评估 §6 已排期），不在本计划。
- **占位符扫描**：所有代码步骤含完整代码；无 TBD/待定；目检步骤给出具体视口尺寸与预期观察点。
- **类型一致性**：`MOBILE_BREAKPOINT_PX`/`resolveIsMobile`/`useIsMobile` 在 Task 1 定义、Task 3 按同名同签名消费；CSS 类名 `ledger-mobile-nav-toggle`/`ledger-mobile-nav-toggle-bar` 与 JSX 中一致；`handleMenuClick: MenuProps['onClick']` 与两处 Menu 的 onClick 用法一致。
