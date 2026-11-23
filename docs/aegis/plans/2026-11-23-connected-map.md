# 内部联通道路与地图接入

Goal: 大地图和小地图显示全部真实道路，东西支线经中央交叉口互通，南侧可以进入内部路网。

Architecture: 继续由 `world/route.js` 定义道路，地形求解共享路口高程，`world.mapPaths` 提供底图；UI 只投影和绘制，不另造道路。保留外围环线参数、景区直达和比赛行为。

Tech Stack: 现有 Three.js、Canvas 2D、Vite、Node test、Playwright；无新增依赖。

Baseline/Authority Refs: 用户 2026-11-23 的带箭头地图反馈；`README.md`；`.agents/notes/implemented/feature/2026-11-23-expanded-road-network.md`；`.agents/notes/implemented/architecture/2026-11-21-scenic-drive.md`。本轮是既有扩路任务的修正，用户要求内部交叉与节点互通；接入底图属于当前授权。

Compatibility Boundary: `road.sample(t)` 和六个景区锚点保持原义；地图按钮、景区直达、玩家指针及现有区域着色保持原交互。旧会话只读，不发送旧任务消息。仅在 `ph-routes` 提交。

Verification: `npm test`、`node src/car/check.mjs`、`npm run build`；真实 Chrome 中检查两种地图有每条支路、交叉口驾驶、六景区直达、主线巡航与离线 HTML。保存本轮截图及数值记录。

## 原因与修复边界

地图只对 `road.sample()` 采样，未消费已有 `world.mapPaths`；路网内部的东西两组只通过外环相连。修复 UI 的单环底图数据来源，并在原路网数据中加入共享中央节点与联络线。道路几何仍是唯一来源，不加入地图专用假线、第二套路由器或新导航功能。

现有 `route.js` 677 行，新增主要是路线数据；`ui.js` 108 行，绘制方法原地改为遍历多条路径。坡度、高程和几何约束沿用已有测试。若南侧连接跨河，使用现有景物批次补桥面支撑，保持河床，不把河流填平。

## 执行步骤

1. 用临时几何采样确认中央横贯、北南斜穿、南侧联络的控制点与水体关系。新增共享节点进入原 `BRANCH_NODES`，复用平滑与坡度约束。
2. 在 `tests/network.test.js` 增加内部连通性回归：移除主环线后，所有支线仍可沿共享节点互达；中央节点至少有四个出入口；检查新线坡度、路口高差和水面净空。先确认旧实现失败，再落地数据与必要的地形/桥梁支持。
3. 增加 `tools/verify-network.mjs`，实际启动游戏并检查大地图、小地图在支路中段均有可见像素，保留景区点击与玩家指针。先复现地图缺线，再将 `mapPaths` 从 `main.js` 传入 UI，删除 UI 对外围环线的独立底图采样。
4. 浏览器检查中央路口、南侧跨河、各联络线与竖屏地图；必要时定点修复。运行相关质量门，重建独立 HTML，保留实际效果图。
5. 原地更新 README 与道路决定笔记的现状、限制、证据；提交本轮完整修改，不合并主分支。

TDD Route: strict（地图用户路径和内部连通性先失败后修复）。ArchitectureReviewRequired: yes（已有道路数据到地图的消费链闭合；最终核对唯一来源与旧 API 兼容）。

## 验收与停止条件

玩家打开地图能看见连通的内部道路，能够从西侧经过中央路口进入东侧或南侧，路口无台阶、道路不没入水中；相关检查成功、独立文件已重建、提交可复核后交付。
