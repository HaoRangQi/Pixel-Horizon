# Agent Note: 民用 NPC 车流

Status: implemented

## Problem

环线此前只有玩家和比赛对手，公路始终是空的。主人要求加入民用车辆，且“建模直接复制现有车辆模型、换个颜色即可”。直接复制整套车壳与车轮车（单车约 12.8 万 + 12.5 万三角形）会让可见三角形和绘制调用随车数线性增长；NPC 还需要跟车、让行、与玩家互不穿模，并且不能接管玩家控制或改动由另一工作流负责的路网与地图数据。

## Decision

交通分成两层，行为与渲染互不依赖：

- `src/traffic/model.js` 是纯数学层，只用 `road.sample(t)` 与 `angleDelta`，不 import Three.js、不写场景对象，因此能在 Node 里直接单测。它负责生成车队、巡航、跟车、双向车道、玩家让行、硬分离与统计。
- `src/traffic.js` 是渲染层：复用 `bodyGeometry(style)` 返回的玩家车壳 `BufferGeometry`（`src/car/bodies.js` 里按风格缓存），每个风格、每种材质合并为一个 `InstancedMesh`，容量取 `maxCount`。车身涂装材质保持白色，逐实例 `instanceColor` 写入调色板颜色，因此“换颜色”不产生新车壳或新材质。

车道沿用驾驶模型的局部坐标约定：右车道中心在 `-road.width * 0.25`，对向车道取正；`place()` 用 `sample(t)` 的切线与横向偏移算出位置，航向、侧倾与前轮转角做指数平滑。NPC 车辆不做独立物理，不消耗 `drive.js` 的玩家状态。

隔离规则按优先级执行：

1. **玩家硬分离**（最高优先级）：若 NPC 与玩家在同一车道且沿路距离小于 `stopGap`，直接把 NPC 放到玩家另一侧，方向按 NPC 自己的行驶方向取；这保证玩家撞上来也不会穿模。
2. **NPC 间距**：同向同车道沿路距离小于 `stopGap` 时钳制后车，防止排队重叠。
3. **跟车**：前车或玩家在前方 `followGap` 内时按比例降速，`stopGap` 处归零。
4. **让行**：仅同向车、玩家从后方 48 m 内快速接近且对向 150 m 净空时，NPC 打灯式移到对向车道，保持 3.2 s 并在玩家超过 14 m 后回正；对向 60 m 内有冲突则中止。

`reset()` / `travel()` 传送玩家后调用 `avoidPlayer()`，把 90 m 内的车移到玩家身后 120 m 处重新入场，避免落地即撞。比赛开始时记录玩家当前开关并暂停交通，`stopRace()` 恢复玩家原先的选择。

对外接口：`N` 键开关车流；`window.__horizon.traffic.configure({ count, density, speedScale, renderDistance, enabled })`，`setEnabled` / `setCount` 单独暴露；`stats()` 与 `summary()` 供验收脚本读取。默认密度 3 辆/km（约 7.46 km 环线、22 辆），`maxCount` 24，渲染距离 600 m。阴影只由轮廓材质（`paint`、`carbon`、`black`、`carbonMatte`、`grille`、`hoodCarbon`）投射，车轮不投影，玻璃不投影。

## Rendering budget

每风格每材质一个 `InstancedMesh`，绘制调用与车数无关；可见实例每帧重新打包 `count`，并刷新包围球以便主相机与阴影相机整体剔除。每帧写入 `instanceMatrix` 与 `instanceColor` 的量与可见车数成正比。

车轮没有复用 `wheels.js` 的完整模型（每只约 31k 三角形），而是用同一套几何工具重建约 1.2k 三角形/只的低模轮：轮胎环、轮辋面、五根辐条、轮毂、刹车盘与固定卡钳。轮心与半径沿用 `FRONT_AXLE` / `REAR_AXLE` / `TRACK_HALF` / `WHEEL_RADIUS`，车身高度与玩家一致。

同一暂停相机下 A/B（Chrome headless，3 辆可见）：无交通 481 draws / 1,315,397 三角形 / 60 fps；有交通 522 draws / 1,847,269 三角形 / 60 fps。即恒定 +41 draws（含阴影 pass），三角形随可见车数增长，帧率不变。

## Alternatives considered

- **每辆 NPC 复制完整 `createCar` 车壳**：颜色随机最直接，但绘制调用与 13 个材质组随车数增长，4 辆车就会把 draws 推高数百；实例化同几何、逐实例色可以在同样外观下把成本压到风格级常量。
- **每次换色克隆材质**：会破坏材质合批并增加 shader/材质管理；`instanceColor` 是 Three.js 为这一场景提供的标准通道。
- **给 NPC 完整车轮**：单轮 31k 三角形、四轮 12.5 万，远处根本分辨不出辐条细节；低模轮在 10 m 内仍可辨认轮胎、轮辋与卡钳。
- **NPC 走独立样条或自建路网**：主人明确要求跟随现有道路且另一工作流负责路网，复制路网会产生两套真值；直接消费 `sample(t)` 可随道路更新自动生效。
- **对 NPC 施加刚体物理或与玩家碰撞检测**：成本高且在玩家高速撞击时需要稳定解算；道路坐标硬分离以更低的成本保证不穿模。
- **只做单向车流**：实现更简单，但双向车流才是公路观感；对向车复用同一套车道与渲染批次。

## Consequences

交通行为可在 Node 单测里验证（`tests/traffic.test.js`：车道、双向、静止玩家不重叠、排队、后车逼近让行、配置项），渲染与浏览器行为由 `npm run verify:traffic` 在真实 Chrome 中检查（10 s 驾驶与 24 次高速逼近均无重叠、`N` 开关、count/density 配置、固定相机 A/B）。代价是：

- NPC 不识别信号灯、路牌或越野路径，只在环线主路行驶；弯道减速由曲率近似。
- 让行是“借对向车道”的简化模型，没有真正的转向灯灯语与对向车协同。
- 每个风格每材质一个批次，新增车身风格会新增一组固定 draw calls（与车数无关）；`styles` 默认只含 `one` 与 `coupe`。
- 可见车数增加时三角形仍线性增长，`renderDistance` 是唯一的距离预算旋钮；当前 600 m 在验收环境保持 60 fps，不代表低端设备。

本决定不改变路网生成、地图/小地图、玩家驾驶状态归属（见[观景驾驶的状态与几何边界](../../implemented/architecture/2026-11-21-scenic-drive.md)）与局部坐标语义（见[常规左舵与驾驶仪表状态](../../implemented/bug-fix/2026-11-22-steering-and-telemetry.md)）。车辆素材的共享几何与低模轮说明补充在 `src/car/ASSET-NOTES.md`。
