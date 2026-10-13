# Timefriend for Vela

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Xiaomi%20Vela%20Watch-blue.svg)](#)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](./src/manifest.json)

小米 Vela 手表快应用：**番茄钟（Pomodoro）+ 手表 → 手机数据同步**。

手表端独立完成番茄钟全流程（专注/休息/循环/统计，本地持久化），每完成一个周期通过
**小米 Vela interconnect（小米互联 / LiFD）** 蓝牙通道推送到手机配套 App，手机端接收、
幂等去重并合并进「今日专注时长」等统计。

---

## 功能特性

| 模块 | 说明 |
|---|---|
| 番茄钟 | 专注/休息时长与循环次数可配；段结束振动提醒（工作 3s / 休息 2s，含长震兜底）；支持退出确认 |
| 统计 | 今日 / 本周 / 本月专注统计，本地持久化（`@system.file` 单键单文件 + 写泵） |
| 屏幕保活 | 倒计时期间屏幕常亮/亮度覆盖（仅番茄钟运行态生效，见 `screenKeep.js`） |
| 手机同步 | 逐条周期推送；UI 暴露失败码（`idle/na/O/H/R`），无日志表端可定位 |
| 多语言 | 简体中文（默认）/ 繁体（台湾、香港）/ English |

## 开源协议

本项目采用 **MIT License** 开源，完整条款见 [`LICENSE`](./LICENSE)。
简言之：允许自由使用、修改、合并、发布、分发、再授权及销售；需保留版权声明与许可声明；
软件按「原样」提供，不附带任何担保。

---

## 目录结构

```
Timefriend for vela/
├── src/
│   ├── manifest.json            # 包名 com.example.timefriend，features 见「系统能力」
│   ├── app.ux                   # 应用入口
│   ├── common/
│   │   ├── store.js             # 共享数据层：file 单键单文件 + 写泵 + globalThis 单例（零 storage）
│   │   ├── screenKeep.js        # 屏幕保活（常亮/亮度），仅番茄钟运行态生效
│   │   ├── phoneLink.js         # interconnect 通道（实例早建/应用层握手/对象直发）
│   │   └── logo.png
│   ├── pages/
│   │   ├── index/index.ux       # 主页菜单（全 App 唯一主读盘入口）
│   │   ├── pomodoro/pomodoro.ux # 番茄钟（配置/运行/统计/同步入口）
│   │   ├── sync/sync.ux         # 手机同步中转页（状态/失败码/立即同步）
│   │   └── settings/settings.ux # 屏幕设置
│   └── i18n/                    # defaults.json(简体) / zh-CN / zh-TW / zh-HK / en
├── sign/
│   ├── debug/                   # 调试证书说明
│   └── release/                 # 正式签名证书（certificate.pem + private.pem，见「签名说明」）
├── 卡死排查与避坑总结.md         # Vela 手表端防卡死规范（真机二分实证，适配本工程必读）
├── AGENTS.md                    # 仓库协作规约（构建/权限/协议同步清单）
├── package.json                 # aiot-toolkit 构建脚本
└── README.md
```

> 手机端配套 App 是**独立工程**（Kotlin/Compose/MVI Android 应用，包名同为
> `com.example.timefriend`），不随本仓库分发。手表数据由它接收并写入 `pomodoro_sessions` 表。

---

## 快速开始

### 环境要求

- Node.js ≥ 8.10
- 小米快应用开发工具链（aiot-toolkit）：`npm install`

### 构建

```bash
npm install        # 安装 aiot-toolkit
npm run release    # 用 sign/release/ 证书签名 → dist/*.release.rpk（正式交付包）
npm run build      # debug 包（仅调试用，勿作交付物）
npm run lint       # eslint 检查 src/
```

产物为 `dist/com.example.timefriend.release.<版本>.rpk`。
安装/推表一律使用 release rpk，并经**运动健康开发者入口**侧载（官方测试文档指定方式）。

### 签名说明（重要）

`sign/release/` 存放手表端正式签名证书：

- `certificate.pem` —— 证书（公钥），已内嵌于每个签名 rpk 的 `META-INF`，属公开信息；
- `private.pem` —— 私钥，**由仓库所有者主动公开**（与手机端配套 App 同一密钥库提取）。

> ⚠️ **安全提示**：该私钥同时是手机端 App 的签名私钥。公开意味着任何人都能以
> `com.example.timefriend` 的身份签名 rpk / APK。本仓库面向学习与二次开发，
> **请勿将本仓库产出的签名用于生产环境**；生产部署请用你自己的密钥库重新提取
> `sign/release/` 证书（提取命令见 [`sign/release/README.md`](./sign/release/README.md)）。
>
> interconnect 硬约束要求手表 rpk 与手机 App **同签名**，因此自建密钥时必须同步替换
> 手机端密钥库，否则手表↔手机通道静默丢包。

### 真机验证前置

1. 手表与手机蓝牙连接正常，手机侧互联权限已授予；
2. 手机端配套 App 已安装且进程存活（SDK 无 manifest 级唤入组件）；
3. rpk 经运动健康开发者入口侧载。

---

## 系统能力

`src/manifest.json` 的 `features` 声明（番茄钟 + 同步全链路只依赖以下五项）：

| feature | 用途 | 代码位置 |
|---|---|---|
| `system.router` | 退出确认后 `router.back()`、跳转同步页 | `import router` |
| `system.file` | 配置/统计/周期记录持久化（`internal://files/tf_*.json`） | `store.js` |
| `system.vibrator` | 段结束振动（工作 3s / 休息 2s，含长震兜底） | `pomodoro.ux` |
| `system.brightness` | 倒计时期间屏幕常亮（仅运行态覆盖界面生效） | `screenKeep.js` |
| `system.interconnect` | 手表→手机数据同步通道 | `phoneLink.js` |

> 未继承 Sportlink 模板的 `hapjs.permission.LOCATION` / `DEVICE_INFO`——番茄钟与同步
> 均不需要定位或设备信息。
>
> 本工程**禁用 `@system.storage`**：目标表型固件上 `storage.get` 读从未写入过的 key
> 必卡死（两次二分实证），持久化全部走 `@system.file`。详见《卡死排查与避坑总结.md》。

## 数据持久化设计（store.js）

- **单键单文件**：`tf_screen / tf_cfg / tf_stats / tf_sessions.json`，单键损坏不连坐；
- **写泵串行**：同一时刻仅一个 `writeArrayBuffer` 在途（回调回来才发下一个），buffer
  保活到回调，杜绝迟到覆盖写把堆垃圾写进文件；
- **读侧串行**：`file.list` 一次枚举 → 存在的键逐个 `readArrayBuffer`；
- **内存权威挂 `globalThis`**：store 模块被 toolkit 按页面复制（build 实证四份副本），
  四份必须操作同一个全局对象；页面只走 `storeGet / storeSet / storeLoad / storeIsLoaded`。

## 手表 → 手机同步协议

### 数据格式（逐条周期，与手机端 PomodoroSessionEntity 1:1 对齐）

```jsonc
// internal://files/tf_sessions.json
[
  { "date": "2026-10-13", "focusMinutes": 30, "restMinutes": 10, "createdAt": 1760352000000 }
]
```

同步时 `phoneLink.js` 将记录作为 `{ "t": "pomo", "d": [ ... ] }` 发往手机；手机端按
`(date | createdAt | focusMinutes | restMinutes)` **幂等去重**写入 `pomodoro_sessions`，
重复同步不出重复行。

### 会话建立顺序（手机侧主导，跳步 = 全部报文失踪）

```
手机(配套 App)                                手表(phoneLink.js)
getConnectedNodes → requestPermission(DEVICE_MANAGER)
addListener → launchWearApp("/pages/sync")  ──→  引擎会话握手
sendMessage hs(c=0)                        ──→  onopen 触发
                                           ←──  回 hs(c=1)（双向可用）
sendMessage req                            ──→  （用户点「立即同步」时）推 pomo
                                           ←──  {t:"pomo", d:[...]}
回 ok                                       ──→  markSynced（UI 显示「已同步」）
```

表端铁律（真机实测）：

1. `onopen` 之前禁止任何 `send`；
2. **报文载荷发对象**，绝不发 `JSON.stringify` 后的字符串——字符串载荷在部分表型被静默丢弃；
3. 可用性以**应用层握手真实往返**为准，不信引擎 `onopen`（会话打开 ≠ 对端可达）；
4. 失败码写进 UI：`O`=onopen 未触发（查手机 launchWearApp）、`H`=握手无应答、
   `R`=业务传输失败、`na`=互联不可用、`idle`=空闲。

## 防卡死规范

手表端快应用的五条铁律（storage 读取、原生调用并发、子页进页路径、连续事件、
屏幕亮度）均有真机二分实证，**改动任何页面 IO/生命周期代码前必读**：
[`卡死排查与避坑总结.md`](./卡死排查与避坑总结.md)。

## 国际化

| 语言 | 文件 |
|---|---|
| 简体中文（默认） | `src/i18n/defaults.json` |
| 简体中文 | `src/i18n/zh-CN.json` |
| 繁体中文（台湾） | `src/i18n/zh-TW.json` |
| 繁体中文（香港） | `src/i18n/zh-HK.json` |
| English | `src/i18n/en.json` |

## 已知限制

- 仅支持 `deviceTypeList: watch`，`minPlatformVersion: 1000`；
- Vela 各表型 API 支持存在碎片化（如部分表型无网络请求），换表型需重新做真机探针；
- 手机端 App 进程需存活才能接收同步（SDK 限制）。

## 致谢

- 小米 Vela 快应用开发文档与 aiot-toolkit；
- 防卡死结论来自真机二分定位实验，每条均有因果验证。

## License

[MIT](./LICENSE) © 2026 xinxiangjueming
