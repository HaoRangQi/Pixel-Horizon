# Agent Note: Node 断言打印 Three.js 场景图导致内存暴涨

Status: implemented

## Problem

`node src/car/check.mjs` 曾在没有任何输出的情况下把整台 Mac 拖死：一次 40 秒涨到 3.16 GB RSS，另一次 18 秒 10.5 GB，用户只能强杀进程，并报告"node 内存泄露干了 300G"。同一时期机器上还有大量 Node 进程，虚拟地址合计几十 TB，很难一眼分清哪部分是正常预留、哪部分是真的失控。

触发点在一条几何回归断言：为验证"换车后 AMG 的方向盘必须离开座舱"，脚本直接写了 `assert.equal(oneWheel.parent, null, ...)`。`oneWheel.parent` 实际是一个 Three.js `Group`，断言必然失败；失败本身是测试该做的事，真正的问题是 **Node 如何格式化这个失败**。`assert.equal` / `assert.deepEqual` 会把 `actual` 和 `expected` 交给 `util.inspect` 打印（`deepEqual` 还会做结构化 diff），而 Three.js 场景对象带着循环的 `parent` 反向引用、完整的 buffer attribute（本项目整车约 36.9 万三角形）和全部纹理。检查器会把这些 typed array 逐元素展开，内存随场景规模非线性膨胀，且分配主要落在 V8 堆外，`--max-old-space-size=512` 完全拦不住。放任它跑下去，几百 GB 是必然结果，而不是夸张。

这类事故的迷惑性在于：进程没有输出、没有异常栈、看起来像死循环；堆上限无效又容易被误判成"外部库泄漏"。记录下来的价值不是这一条断言，而是让下一次看到"Node 莫名吃内存"的人先想到"是不是某个断言在打印活对象"。

## Decision

验证脚本中，**任何 Three.js 对象都不得作为 `assert.equal` / `assert.deepEqual` / `assert.notEqual` / `assert.notDeepEqual` 的参数**，也不得先塞进数组、Map 再整体深度比较（对象引用会跟着进去）。只比较能被廉价格式化的值：

- 身份：`assert.ok(a === b, message)`；
- 归属：`assert.ok(group.children.includes(obj), message)`；
- 数量与类型：`length`、`.type`、`.name`、计数；
- 需要区分实例时用 `uuid` 等字符串，且只作为补充，不替代身份判断。

`src/car/check.mjs` 顶部因此提供了 `same(a, b, message)` 与 `differs(a, b, message)` 两个布尔助手，所有场景对象比较都经由它们；换车断言同时检查座舱挂载关系，而不是把 `parent` 本身交给断言库。

```js
// src/car/check.mjs
const same = (a, b, message) => assert.ok(a === b, message);
const differs = (a, b, message) => assert.ok(a !== b, message);

differs(coupeWheel, oneWheel, 'coupe steering wheel replaces the AMG wheel');
assert.ok(!cabin.children.includes(oneWheel.parent), 'the AMG mount leaves the cabin');
```

对应规则也写进了 [`src/car/ASSET-NOTES.md`](../../../../src/car/ASSET-NOTES.md) 的 Inspection 一节，避免只存在于聊天记录里。

## 机制：为什么一条断言能吃掉几十 GB

1. 断言失败时，Node 构造 `AssertionError`，用 `util.inspect` 生成 `actual` / `expected` 的可读表示；严格深度比较还会计算结构 diff。
2. `util.inspect` 默认递归展示对象自有属性。Three.js 的 `Object3D` 有 `parent`，父子互指形成环；检查器靠 seen 集合避免无限递归，但不会避免**把整张图打印一遍**。
3. `BufferAttribute.array` 是 `Float32Array` / `Uint32Array`。`util.inspect` 对 typed array 默认逐元素输出，不按普通数组截断；整车几何的顶点、法线、UV、索引都会被展开成文本。
4. 字符串和 backing store 属于堆外/大对象分配，`--max-old-space-size` 只限制 V8 老生代，因此限额形同虚设；用 `ulimit -v` 硬压虚拟内存时进程不会干净退出，而是卡在分配/GC 抖动里（本项目实测如此）。

等价最小复现如下。**不要在没有看门狗和内存上限的机器上直接运行**，一次失败断言就足以让机器失去响应：

```js
// repro.mjs — 危险示例：一条失败断言即可耗尽内存
import assert from 'node:assert/strict';
import * as THREE from 'three';

const root = new THREE.Group();
for (let i = 0; i < 200; i++) root.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64)));
assert.equal(root, null, 'boom'); // actual 是场景对象，失败信息会打印整张图
```

用与整车同量级的对象图复现时，20 秒 RSS 达到 11.2 GB；`--max-old-space-size=512` 不影响该斜率。

## 排查路径：下次怎么在十分钟内定位

1. **先分清 RSS 和 VSZ。** Node 会预留大量虚拟地址，单进程几百 GB VSZ、几十个进程合计几十 TB 都可能是正常的 guard reservation；只有持续上涨的 **RSS** 才是泄漏。`ps -o pid,rss,vsz,command` 或活动监视器的"内存"列。
2. **看有没有输出。** 纯计算型泄漏通常仍在推进；断言格式化型事故几乎零输出，且 CPU 单核打满、内存线性上涨。
3. **堆上限是否有效。** 加 `--max-old-space-size=512` 仍暴涨，说明大头在堆外（字符串、ArrayBuffer、GC 元数据），不要继续在 JS 堆里找。
4. **采样调用栈。** macOS 的 `sample <pid> 3` 若显示大量 `ArrayBuffer` 构造、`inspect`、字符串拼接与 GC，基本可以锁定"在格式化大对象"。
5. **二分脚本。** 在验证脚本里插入 `console.error` 标记，确认卡在哪一段；再把该段单独抽成最小脚本复现。本项目正是靠这一步把范围从"整车/three"缩到"一条断言"。
6. **审所有对象比较。** 搜 `assert.(equal|deepEqual|notEqual|notDeepEqual)`，确认参数里没有活对象；`deepEqual` 尤其危险，因为它连数组/Map 里的对象引用也会展开。

## 验证与防回归

- `node src/car/check.mjs`：修复后约 1 秒结束并输出 `"status": "PASS"`（97 meshes / 368,938 triangles），此前同一条命令 40 秒仍无输出。
- `npm test`：15/15 通过，换车断言仍能捕获"AMG 方向盘留在 M4 座舱"这类回归。
- 新增 `npm run verify:memory`（`tools/verify-memory.mjs`）：真实 Chrome 中驾驶 60 秒并连续换车 12 次，断言 JS 堆无上升趋势、`renderer.info.memory` 的几何/纹理/着色器数量与场景节点数不随换车增长。实测堆 107 → 95 MB，峰值较基线 +1 MB；12 次换车后几何 191、纹理 33、程序 104，场景节点 123 均保持不变。
- 所有浏览器验收脚本都在 `finally` 中 `browser.close()`，包括断言失败路径；验证用 Vite 进程在验收结束后停止，避免留下孤儿进程。

## Alternatives considered

### 保留对象比较，用 try/catch 捕获后再输出简短信息

看起来能兼顾"断言语义"和"失败信息可控"，但 `AssertionError` 的 `actual` / `expected` 展示是在错误构造阶段生成的，爆炸发生在抛错路径本身，`catch` 拿到的已经是付过内存代价的错误对象。且这条断言本来就是错的（`parent` 不会是 `null`），保留它只会让每次运行都先炸一遍。

### 比较 `name` 或 `uuid` 字符串

字符串比较不会触发场景打印，确实安全。但 `name` 可重复，无法证明"这是另一个实例"；`uuid` 每次重建都会变，只能证明"不是同一个构建"，不能证明"共享/未共享"的契约。本轮要守的正是身份关系（coupe 必须换成自己的方向盘和仪表、AMG 的挂载必须离开座舱），布尔身份与 `children.includes` 最直接，也不牺牲可读性。

### 删掉新增的座舱断言，只保留原有用例

这样能立刻绕开内存事故，但会丢掉本轮最重要的回归保护：按车型挂载座舱的契约一旦被破坏，表现就是"换了车却还是 AMG 的仪表"，而这类问题截图和数值检查都不一定抓得到。事故根因是断言写法，不是断言本身，因此修复写法而不是删除覆盖。

## Consequences

收益：验证从"卡死整机、只能强杀"回到 1 秒级完成；同样的坑在 `deepEqual`、`console.log(scene)`、错误上报里也被提前拦住；新增的内存浸泡把"游戏运行时是否泄漏"变成可重复的量化检查，而不是靠感觉。

代价：布尔断言的失败信息只有一句自写文案，定位时要回到源码看上下文；因此每条断言的消息必须具体到对象和期望关系。验证脚本作者需要记住这条纪律，不能依赖"随手比较两个对象"的便利。`verify:memory` 单次约 100 秒，属于慢检查，适合提交前跑而不是每次热更新跑。

已知上限：`verify:memory` 依赖 Chrome 的 `performance.memory`（粗粒度、按页统计），只能发现趋势性增长，不能给出精确字节账；若该 API 在未来浏览器中被移除，改用 `renderer.info.memory` 与场景节点计数作为替代信号，仍能覆盖换车/后视镜重建这类主要泄漏面。
