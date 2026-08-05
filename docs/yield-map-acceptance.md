# 股息率地图（yield-map）验收记录（2026-08-05）

> 功能已实现并合入 main（`Merge branch 'feat/yield-map'`）；本文档为回归基准与遗留项清单。

## 回归测试

- `npm run typecheck`：零错误
- `npm test`：**370/370 全部通过**（64 个测试文件）
  - 顺带修复：`webRuntimeRoutes.test.ts` 改用随机端口（`LOCAL_HTTP_API_PORT=0`），不再因 3210 被预览占用而 EADDRINUSE 失败（该测试历史上是唯一的环境性失败）

## 桌面端验收（浏览器预览模式，headless 主进程 + 真实 SQLite）

| 验收项 | 结果 |
|---|---|
| 首屏触发全市场抓取 | ✅ 5,889 只股票 / 129 行业（计划预期 ~5,888） |
| 行业层 Treemap 渲染 | ✅ 6 档颜色与图例一致 |
| 点击行业块 drill-down 到股票层 | ✅（`nodeClick: 'zoomToNode'`；曾因计划代码 `nodeClick: false` 失效，已修复） |
| 股票方块面积=股息率 | ✅ `value = 1 + yieldTtm * 20`，同维度双编码（大且红=高息） |
| 点击股票块跳转详情 | ✅ 跳转 `#/stock-detail?assetKey=STOCK:A_SHARE:300223&symbol=300223` |
| 二次进入秒开（24h 快照命中） | ✅ 时间戳复用 10:01:18 快照 |
| 刷新按钮重新抓取 | ✅ 时间戳 10:01:18 → 11:21:26 |
| SQLite `yield_map_snapshots` | ✅ 5,889 行，`fetched_at` 已更新 |

## 在线模式验收（Supabase）

**暂缓**：需要登录账号。代码侧已由 E1/E2 评审覆盖（`industry_yield_snapshots` 迁移 + RLS 4 policy 实测核对、`SupabaseYieldMapRepository` 读写、useCase 在线兜底与上传）。待有账号时补：登录后刷新 → 云端出现当前用户快照行 → 换设备读取。

## 附带交付：浏览器预览端口自动退避（commit ac97dbf）

`npm run dev:browser-preview` 启动时探测 8192/3210，被占用则自动退避到空闲端口；vite `/api` 同源代理到主进程实际端口；renderer 改相对路径；CORS 白名单/CSP/邮件回调跟随实际端口。实测：housing 预览占用 8192/3210（另有进程占 8193/3211）时，新实例自动落到 **8194/3212**，页面与代理链路正常。

## 遗留 Minor（不阻塞合并，见最终审查）

- D2 review：`onSelectStock` 闭包身份、`chartRef` 死代码、`fetchedAt` 空值边界、双导出冗余、图例位置措辞
- E2 review：`.limit(500)` 快照截断边界、在线兜底 DTO 无 `fetchedAt`、上传 await 增加延迟
