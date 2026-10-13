# Timefriend for Vela 项目规定

## 构建与交付

- 只编译正式包：用 `npm run release`（aiot release，使用 `sign/release/` 下的证书签名），
  **不要用 `npm run build` 出 debug 包交付**。
- 产物固定在项目 `dist/` 目录：`dist/com.example.timefriend.release.<版本>.rpk`。
- `dist/` 里如出现 debug 包（`*.debug.*.rpk`），一律删除，不留作交付物。
- 安装/推表一律使用 `dist/` 下的 release rpk。

## 权限约定

- 番茄钟仅依赖 `system.router` / `system.file` / `system.vibrator` / `system.brightness`。
- 手机同步额外依赖 `system.interconnect`。
- **禁用 `system.storage`**：本表固件 `storage.get` 读从未写入过的 key 必卡死
  （2026-10-14 两次二分实证）；持久化一律走 `system.file`（写泵纪律见 store.js）。
- **不继承** Sportlink 的 `hapjs.permission.LOCATION` / `hapjs.permission.DEVICE_INFO`
  （番茄钟与同步都不需要定位或设备信息）。

## 手机端（配套 App）

- 手机端是独立工程 **`D:\Timefriend`**（Kotlin/Compose/MVI，包名同为 `com.example.timefriend`）。
  本 Vela 工程**不含**手机端代码，手表数据由它接收并写入 `pomodoro_sessions` 表。
- 手机端接入：把官方 `xms-wearable-lib_1.4_release.aar` 放入 `D:\Timefriend\app\libs\`
  （见该目录 README），`WearableLink.kt` 在 `AppContainer` 初始化时自动启动监听。
- 签名：本工程 `sign/release/` 证书由 `D:\Timefriend\timefriend` 密钥库提取，
  SHA256 指纹已校验一致，保证手表 rpk 与手机 App 同签名（interconnect 硬约束）。

## interconnect 铁律（来自 vela-interconnect-sync 手册）

- 报文载荷发**对象**，绝不发 `JSON.stringify` 后的字符串（部分表型静默丢弃）。
- `onopen` 之前禁止任何 `send`。
- 会话由**手机侧** `launchWearApp(nodeId, "/pages/sync")` 建立，缺它表端 `onopen` 不触发。
- 表端无日志，断点靠 UI 失败码（O/H/S/R/T）定位。
- 包名一致 + 与手机 App 同签名 + rpk 经运动健康开发者入口侧载。

## 同步数据协议（逐条周期）

- 手表每完成一个番茄钟周期（专注+休息）记一条到 `timefriend.pomodoro.sessions`：
  `{ date, focusMinutes, restMinutes, createdAt }`，`createdAt` = 完成时刻稳定时间戳。
- `sync.ux`「立即同步」经 `phoneLink.syncPomodoro()` 发 `{ t:"pomo", d:[...] }`。
- 手机端按 `(date|createdAt|focusMinutes|restMinutes)` **幂等去重**写入 `pomodoro_sessions`，
  手机端「今日专注时长」等统计自动合并手表数据。
- 改协议字段时，必须同时改：`pomodoro.ux`（pushSession）、`phoneLink.js`（syncPomodoro 注释）、
  `sync.ux`（loadSessions/doSync）、`D:\Timefriend` 的 `WearableLink.kt`（parseSessions）与
  `TimeRepository.upsertWatchPomodoroSessions`。
