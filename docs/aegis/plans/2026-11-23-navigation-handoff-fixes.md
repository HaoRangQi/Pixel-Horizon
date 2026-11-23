# 导航交付边界修复

Goal: 完成 `ph-ai-nav` 原任务，补齐复现出的长路线、地图入口和 LLM 生命周期缺陷，并在功能分支追加提交。

Architecture: 保留道路 → 只读适配 → 共享路径 → 地图/驾驶员的数据流；在各自状态所有者内修复。

Tech Stack: 原生 JavaScript、Node test、Vite、Three.js、现有 Playwright 验收。

Baseline/Authority Refs: 原任务规格；`docs/ai-autopilot.md`；`.agents/notes/implemented/architecture/2026-11-23-navigation-and-ai-driver.md`；当前 `f10dd57`。原会话快照只读，继续状态记录在 claude-mem 的 `ph-ai-nav` 列表。

Compatibility Boundary: 现有 N/B 按键、手动驾驶、巡航、单向环线、配置字段和独立 HTML 入口保持可用；不改路网生成，不引入依赖，不合并 master。

Verification: 先通过单测/浏览器复现，再运行 `npm test`、`npm run check`、`npm run build`、`verify:navigation`、`verify:browser`、`verify:standalone`。仓库没有 `build.mjs`，现有构建入口是 `npm run build`。

## 复现与修复范围

1. `pathProgress` 把进度折叠到 ±半圈，长路线超过半圈时被当成倒车。`src/nav/path.js` 按路径区间或上次进度展开环线坐标；`src/nav/navigation.js` 保存累计进度。`tests/navigation.test.js` 覆盖长路线、跨零点、真实倒车和路径对象复用；`tests/ai.test.js` 覆盖长路线本地驾驶到达。
2. `src/ai/llm-driver.js` 的请求控制器和取消标记共享，取消/换配置后旧回复仍可发布；TTL 从回复时刻开始，会重用过时观测。改为每个请求拥有自己的控制器、定时器和身份，取消使结果失效，失败清空缓存，TTL 从请求观测时刻开始。用可控 Promise 和时钟验证取消、换配置、晚回复、失败回退与过期；保持单请求节流。
3. JSON 解析会把布尔值变成油门、忽略非法刹车，并继续从非法 JSON 中捞取部分字段。保留数字字符串、别名、围栏和完整文本指令容错，拒绝已出现但无效的控制字段。配置按文档的 localStorage → 页面配置 → 运行时顺序覆盖；Ollama 原生请求传入相同温度与输出长度限制。
4. `src/main.js` 的自动驾驶动作只接受 `drive`，但按钮位于 `map`。允许地图入口并恢复驾驶；`tools/verify-navigation.mjs` 通过实际按钮启动，继续核对 B、人工接管、抵达与 LLM 回退。

## 实施与验收顺序

先添加上述失败用例并运行 `node --test tests/navigation.test.js tests/ai.test.js`；使用独立端口启动本工作树并运行导航验收，确认地图按钮的失败。随后按 1、2/3、4 的所有者顺序修改，每步跑对应回归。最终构建网站和独立 HTML，运行受影响的浏览器验收，目视检查导航截图，更新现有说明和架构笔记，并记录命令退出码与提交哈希。

## 取舍与风险

选择延续共享路径及本地回退，不新增规划器或请求重试层。删除半圈固定折返、共享取消标记、回复时刻 TTL 和非法字段静默归零路径。逐帧累计进度假设相邻观测移动不足半个环线；地图传送已有清空导航的入口。网络失败、过期和取消仅使 LLM 失效，本地规划器继续工作。

各编辑模块均小于 800 行；请求生命周期仍属于 `llm-driver.js`，不把状态补丁分散到 UI 或驾驶物理。道路分叉拓扑仍需路网工作流提供连接关系，当前适配范围是单环或有序连续路段。架构意图不变，更新现有笔记即可。
