# Pixel Horizon 可玩首版

## Goal
用户已批准研究方案并明确要求直接完成、看效果。交付本地可试玩的 3D 像素观景驾驶游戏，红色 AMG ONE 风格车、六段山海风景、四驾驶视角、停车环视、日光切换、巡航辅助、简洁中文 HUD。可选短程竞速在主体验完成后集成。

## Architecture / Tech Stack
Vite、原生 ES 模块、Three.js。固定步长驾驶模拟，连续曲线道路，程序化低模车与景观。世界坐标 Y 向上；车身本地 +Z 为前方，+X 为右侧。原生 DOM HUD 与低分辨率 3D 画面分开。

## Baseline / Authority Refs
`docs/research/2026-11-21-pixel-horizon-brief.md`；用户最新授权“直接做完我看看效果”。本项目无现有应用代码；KongZhan 只读参考。ArchitectureReviewRequired: yes。

## Compatibility Boundary
不编辑 KongZhan，不改动现有研究事实。游戏无登录、联网、付费或外部资产依赖。风景与可玩性为交付条件，帧率是实测指标。无旧逻辑需要退休。

## Ownership and public contracts
- `src/world.js` 由 world worker 独占：场景、道路和地形，导出 `createWorld(scene)`。返回 `road`、`regions`、`update(dt,time)`、`setMood(name)`、`getRegion(t)`；`road` 提供 `length`、`width`、`sample(t)`、`nearest(x,z)` 和 `groundHeight(x,z)`。`sample` 返回 `{position: Vector3,tangent: Vector3,heading:number}`，heading 为 atan2(tangent.x,tangent.z)。`nearest` 返回 `{t,distance,point:Vector3,heading}`；t 是环线归一化弧长。
- `src/car.js` 由 car worker 独占：导出 `createCar({color}={})`，返回 `{root,body,wheels,cockpitCamera,hoodCamera,update(dt,{speed,steer,throttle,brake,time})}`。车轮与方向盘可动，视觉网格不控制驾驶状态。
- `src/drive.js` 由 root 负责：纯驾驶状态与固定步长更新，无 DOM；对 road API 进行查询，负责路肩、重置、巡航、比赛进度。
- `src/main.js` / `src/camera.js` 由 root 负责：输入、主循环、相机、渲染、音效与模块集成。
- `index.html`、`src/style.css`、`src/ui.js` 由 root 负责：开始、暂停、地图、景区切换、按钮、触控和 HUD。

## Tasks / Verification
1. 建立 Vite 与 Three.js，写驾驶规则测试并观察缺失实现的失败；安装开发/浏览器验证依赖。
2. 并行制作车模与世界；root 实现驾驶、相机、UI 和音效。模块各自有唯一 owner，接口改变先通知消费者。
3. 运行 `npm test` 与 `npm run build`；启动 `npm run dev -- --port 5173`。
4. 用 Playwright 实际操作开始、加速、刹车、转向、四视角、巡航、六景区、日光切换、暂停与重置；检查浏览器错误及移动布局。
5. 目视桌面与关键视角截图，修正车辆比例、地形道路接触、景物密度和 UI 遮挡；保留可重现测试与截图。
6. 提供运行地址、代表截图和 README 启动方式。保留开发服务器供用户试玩。

## TDD Route / Complexity / Risks
驾驶纯逻辑采用 strict 测试；程序化视觉资产以浏览器渲染验收。每个模块一个职责，避免单文件巨型游戏。地图长度与分区变化通过实际巡航测量；大量景物以实例化降低绘制调用。模型为原创近似造型，不依赖未经验证的下载资源。首版以桌面浏览器为验收平台。
