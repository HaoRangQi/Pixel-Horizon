# 精细像素驾驶重制

## Goal / authority
用户明确拒绝首版粗糙造型与景观，要求常规左右转向、左侧驾驶位、更还原 AMG ONE、更丰富精细的像素场景，并补充驾驶舱仪表功能仿真。本轮直接实施并交付效果，不再询问方向。

## Evidence / baseline
基于当前 src 模块、README、研究简报和用户实际反馈。已数值复现：旧版 D/steer=+1 在追尾投影得到 screenX<0，实际左转；cockpit.local.x=-.325 位于车头+Z的右侧。首版已备份到 artifacts/before-visual-rework/。

## Art direction
精细建模配合受控像素渲染。车壳有连续曲面、准确比例、独立轮拱和空气动力学细节；植被有树干分叉与叶团层次，近景有花草/碎石，路面有纹理、标线、接缝与边缘；水面与岸线、分层山脊、真实接地阴影形成空间深度。避免可见积木房、三角圣诞树、整片无纹理平地和满屏几何大墙。先验收海岸/车辆/驾驶舱，再对六区取样。

## Skills actually selected
create-game-assets（视觉目标、资产来源与质量）、threejs-materials-lighting（PBR、反射、阴影）、shader-programming（像素纹理、水面、色阶）、level-design（视线与景观节奏）、input-systems 与 physics-tuning（方向及控制）、camera-systems（视角）、threejs-gltf-loading（若车模来源适用）。仅核查已安装技能，无需额外安装技能。

## Owners and contracts
- root：src/drive.js、src/input.js、src/main.js、src/camera.js、src/ui.js、仪表状态、渲染管线、测试与集成。
- car owner：src/car.js 与 src/car/，原创或许可明确的 AMG ONE 车模与驾驶舱仪表。前方+Z，上方+Y；驾驶员左侧是本地+X；steer正数表示驾驶者向右，前轮视觉rotation.y应为负。保留createCar和现有返回接口。
- landscape owner：src/world.js、src/world/terrain.js、src/world/route.js 和专属地形/材质helper；不改scenery.js。保留road/query和createWorld接口。
- scenery owner：src/world/scenery.js 和 src/world/scenery/专属helper；不改地形、路线和主world文件，保留addScenery接口。

车模update扩展输入：{speed,steer,throttle,brake,time,rpm,gear,fuel,coolant,odometer,turnSignal}；speed为有符号m/s，steer为驾驶者右转正值，rpm为实际发动机状态，gear为'N'/'R'/1..7。车模只呈现、不定义机械状态；状态唯一来源为drive.js。

## Acceptance / verification
1. A/← 向左、D/→ 向右，倒车符合汽车运动；前轮、方向盘与相机一致，驾驶位位于车内左侧。
2. 自动换挡有转速回落与防抖，车速/转速/挡位、燃油、冷却温度与里程可读并随驾驶更新。仪表白天与日落都可见，驾驶员前方道路不被仪表遮挡。
3. 实际看车头/侧/车尾近景与驾驶舱；精度不能仅以三角形数量代替。
4. 海岸、田野、河谷、湖泊、山顶有近中远景和真实材质/阴影；在默认追尾及车内视角检查。
5. npm test / build通过；真实浏览器键盘左右、巡航、四视角、动态仪表、地图、日落、摄影、短赛与离线HTML验证；留下新旧对比截图和试玩入口。

## Compatibility / recovery
保留自由驾驶、六区地图、巡航、摄影与短赛入口，不更改KongZhan。保持独立HTML和网站两个交付入口。静态程序纹理优先于外部网络依赖。当前修改中不重建5174已交付的dist，直至候选可验收；最终统一构建与重新验证。
