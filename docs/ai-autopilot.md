# 导航、路线高亮与 AI 自动驾驶

本版在原有观光驾驶之上加入三件事：

1. **目的地**：可以为任意景区设置/清除导航终点。
2. **共享路径查询**：小地图高亮、AI 驾驶、LLM 观测使用同一份有序路径点。
3. **可插拔驾驶员**：确定性本地规划器默认可用；OpenAI 兼容 / Ollama 兼容的 LLM 后端作为可选插件，默认关闭，异常时自动回退。

## 模块边界

| 模块 | 职责 | 不做什么 |
| --- | --- | --- |
| `src/nav/road-adapter.js` | 只读适配层：把单条环形公路或有序多段路网统一成 `{ length, sample(t), nearest(x,z) }` | 不修改任何道路对象，不生成路网 |
| `src/nav/path.js` | 路径查询：路网 + 起点 + 终点 → 有序路径点（含累计距离与航向）；提供 `pointAt`、`pathProgress`、`lanePoint` | 不关心 UI、车辆或网络 |
| `src/nav/navigation.js` | 保存目的地与缓存的查询结果；只有目的地变化或倒车退出规划区时才重建 | 不直接绘制、不直接驾驶 |
| `src/ai/local-planner.js` | 确定性驾驶员：纯追踪 + 弯道限速 + 终点制动 | 不读 DOM，不访问网络 |
| `src/ai/llm-driver.js` | 配置解析、请求节流、超时、OpenAI/Ollama 协议、容错 JSON 解析、统计 | 不决定何时接管，不直接改车辆状态 |
| `src/ai/autopilot.js` | 驾驶接口编排与安全回退：LLM 新鲜指令优先，否则本地规划器；终点制动永远走本地 | 不阻塞 120 Hz 物理循环 |
| `src/ui.js` | 小地图/大地图的终点标记与路线高亮、导航状态、目的地按钮 | 不拥有路径数据 |
| `src/main.js` | 目的地/自动驾驶动作、驾驶输入切换、抵达判定、对外调试 API | 不重复实现路径算法 |

道路生成仍归 `src/world/route.js` 所有；本工作流没有改动 `points`、曲线参数或道路网格。

## 使用方式

| 操作 | 方式 |
| --- | --- |
| 设置目的地 | 按 `M` 打开地图，点任意景区右侧的 `◎`；或按 `N` 自动选择前方最近的景区 |
| 清除目的地 | 地图底部“清除终点”；再按一次 `N`；抵达后自动清除 |
| 查看高亮 | 小地图与大地图都会从当前位置画出到终点的酸黄色路线，并标记终点旗帜 |
| 自动驾驶 | 按 `B` 或地图底部“自动驾驶”。地图按钮会关闭地图并开始驾驶；没有目的地时自动把前方最近景区设为终点 |
| 人工接管 | 任何油门、刹车、转向或手刹输入都会立即退出自动驾驶，导航路线保留 |
| 抵达 | 距终点约 8 m 时本地规划器制动停车，自动退出自动驾驶、清除终点并提示 |

## 驾驶员接口

`src/ai/autopilot.js` 与 `src/ai/local-planner.js` 共用同一份契约：

```ts
interface DriverObservation {
  x: number; z: number;          // 世界坐标（米）
  heading: number;               // 弧度，+Z 为 0，驾驶方向为正前方
  speed: number;                 // 米/秒，倒车为负
  t: number;                     // 当前路段进度 [0,1)
  path: PathPlan | null;         // 共享路径查询结果
  progress: number;              // 已在路径上行驶的米数
  remaining: number;             // 到终点的剩余米数
  destination: { t: number; label: string; x: number; y: number; z: number } | null;
  roadWidth: number;             // 道路宽度（米）
  laneOffset: number;            // 右侧车道中心相对中心线的偏移（米）
}

interface DrivingCommand {
  throttle: number;              // 0..1
  brake: number;                 // 0..1
  steer: number;                 // -1..1，正数向右（与 A/D 输入一致）
}
```

本地规划器始终被计算。`autopilot.command()` 是同步的：LLM 指令只会在“新鲜且合法”时替换本地指令；`autopilot.update()` 负责以受控频率发起非阻塞请求。因此在 120 Hz 固定步长循环中不会等待网络。

## 启用 LLM

默认配置为 `enabled: false`，没有端点或模型时同样视为关闭——**不会发出任何请求**，既有驾驶、巡航、比赛、地图功能不受影响。密钥从不写入仓库、日志或 `status()`。

配置来源（按优先级从低到高合并，后加载覆盖前者）：

1. `localStorage['pixel-horizon-ai']` 中的 JSON。
2. 页面脚本加载前设置的 `window.__HORIZON_AI__`。
3. 运行时 `window.__horizon.autopilot.configure({...})`。

### 示例 A：本地 Ollama（OpenAI 兼容端点）

```js
window.__HORIZON_AI__ = {
  enabled: true,
  endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
  model: 'qwen2.5:7b-instruct',
  apiKey: '',
  timeoutMs: 2200,
  minIntervalMs: 900,
  commandTtlMs: 2500,
  maxTokens: 120,
  temperature: 0.1,
};
```

### 示例 B：本地 Ollama 原生协议

```js
window.__HORIZON_AI__ = {
  enabled: true,
  endpoint: 'http://127.0.0.1:11434/api/chat',
  model: 'llama3.1',
};
```

以 `/api/chat` 结尾时使用 Ollama 原生请求体与 `message.content` 响应；`temperature` 和 `maxTokens` 分别映射为 `options.temperature` 和 `options.num_predict`。其余端点使用 OpenAI chat-completions 结构，也兼容 `choices[0].text`。

### 示例 C：OpenAI 兼容云服务

```js
window.__HORIZON_AI__ = {
  enabled: true,
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  // 不要把密钥写进源码或提交；从本地环境注入，例如浏览器控制台或本机代理。
  apiKey: window.__MY_LOCAL_KEY__,
};
```

> ⚠️ 浏览器直连云端会把密钥暴露给页面与开发者工具，也受 CORS 限制。更安全的做法是本地代理或本地模型；本项目不提供也不要求任何云端密钥。

### 请求协议

请求体（OpenAI 形态）：

```json
{
  "model": "<model>",
  "stream": false,
  "temperature": 0.1,
  "max_tokens": 120,
  "messages": [
    { "role": "system", "content": "……只返回一个 JSON 驾驶指令……" },
    { "role": "user", "content": "{\"speedKmh\":64,\"remainingM\":812,\"roadWidthM\":12.2,\"rightLaneOffsetM\":3.1,\"path\":[{\"aheadM\":8,\"forwardM\":7.1,\"rightM\":2.6,\"turnDeg\":-3}]}" }
  ]
}
```

- `path` 是右车道中心在车辆局部坐标下的采样：`forwardM` 向前、`rightM` 向右、`turnDeg` 为路径航向变化（正值表示路线向左弯）。
- 期望回复：单个 JSON 对象 `{"throttle":0,"brake":0,"steer":0}`（可附 `confidence`/`reason`）。
- 解析容错：Markdown 代码围栏、对象前后夹杂说明文字、数字字符串、`accel`/`braking`/`steering_angle` 等别名、`command`/`action` 嵌套。
- 已提供的控制字段必须是有限数字或非空数字字符串；布尔值、空值、数组及非法数值使整条指令失效，立即回退本地。缺省控制字段按 0 处理。
- 安全钳制：油门/刹车限制在 0..1，转向限制在 -1..1；油门与刹车同时大于 0.05 时刹车优先。
- 配置了自定义请求头时通过 `headers` 传入；`apiKey` 存在时自动加 `Authorization: Bearer <key>`。
- CORS：浏览器直连需要端点允许来源。Ollama 可设置 `OLLAMA_ORIGINS=*`（仅本机开发）。

### 时延与费用

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `timeoutMs` | 2200 | 单次请求超时；超时立即回退本地 |
| `minIntervalMs` | 900 | 两次请求的最小间隔；同一时刻最多一个在途请求 |
| `commandTtlMs` | 2500 | 从请求采集观测时刻起计算的有效期，包含网络等待；过期即回退本地 |
| `maxTokens` | 120 | 回复足够短，降低延迟与费用 |
| 失败退避 | 指数 | 连续失败后最多暂停 15 秒再试 |

一次请求约 250–400 tokens（含系统提示与观测），默认约 1 次/秒，即每小时约 100 万 tokens 量级。本地模型只消耗算力；云端按各自价格计费。若模型延迟高于 `commandTtlMs`，车辆会持续由本地规划器驾驶——LLM 永远不会成为单点故障。

## 安全边界

- **默认关闭**：没有显式配置就不发请求。
- **本地兜底**：禁用、缺配置、HTTP 错误、超时、非法 JSON、指令过期都会回退到 `local-planner`。
- **终点优先**：距终点 8 m 内强制本地制动，LLM 不能覆盖制动指令；实际停车位置仍受接管时车速影响。
- **人工优先**：任何手动输入立即退出自动驾驶。
- **请求隔离**：退出自动驾驶或修改配置时清除缓存指令并取消请求，迟到回复不能重新接管。请求失败立即清除上一条指令，使用本地规划器。
- **输入钳制**：非法数值被拒绝；油门/刹车冲突时刹车优先。
- **不泄密**：`status()` 只暴露端点主机名与模型名，不包含密钥；仓库中没有密钥或私有端点。
- **最小观测**：只发送车辆状态与相对路径采样，不发送用户标识、存档或浏览数据。

## 验证与演示

```sh
npm install
npm test                     # 含 navigation / ai 单元测试
npm run verify:navigation    # 需要先启动 dev server（默认 5174）
```

若端口被占用，与其他验收脚本一样使用环境变量：

```sh
npm run dev -- --port 5176
HORIZON_URL=http://127.0.0.1:5176/ npm run verify:navigation
```

`verify:navigation` 会：

1. 打开地图点 `◎`，断言小地图像素发生变化、路径点数量与剩余距离正确。
2. 点击地图里的“自动驾驶”启动本地规划器，断言返回驾驶界面、车辆沿高亮路线前进并保持右侧车道；再验证 `B` 能关闭/重新启用。
3. 手动按键接管，断言导航仍在。
4. 清除终点，再设置一个 160 m 外的终点，断言车辆停车、退出自动驾驶并清空目的地。
5. 启动一个本地 mock OpenAI 兼容端点（无外部网络、无密钥），断言请求协议、模型名、观测结构、车辆确实被 LLM 指令驱动。
6. 关闭 mock 端点，断言请求失败计数上升、自动回退本地且车辆继续行驶。

结果写入 `shots/navigation-results.json`，截图在 `shots/rework/navigation-*.png`。

`npm test` 还覆盖约 5.97 km 的长路线驾驶到达、跨环线零点后的进度连续性、倒车重规划，以及 LLM 迟到回复、取消、换配置、非法控制字段和过期回退。

## 集成注意

- **路网扩展**：`readRoadNetwork()` 接受单条道路、道路数组或 `{ routes: [...] }`。多段路网按数组顺序线性化，并整体首尾相接。分叉/路口拓扑尚未建模；另一工作流定义连接关系后，可在 `readRoadNetwork` 之上增加图搜索，而不必改 `path.js` 的输出格式。
- **单向行驶假设**：路径始终沿 `t` 增加方向前进。终点在当前点后方时会绕环线一整圈，这是有意的单行道语义；暂不支持掉头。
- **路径进度**：导航保存累计进度，经过半圈或环线零点时继续使用同一份路径。相邻观测应相距不足半圈；地图直达会先清空导航。
- **就近目的地**：地图不会把前后 80 m 内的当前景区再次设为终点；API 按单向行驶语义处理，选择稍后方的坐标会绕行近一整圈。
- **性能**：每次重新规划约 1200 个路径点（6 m 间隔）；只在设置目的地/倒车退出时重建，常规帧只做二分查找与插值。
