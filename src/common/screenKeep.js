/**
 * 屏幕保活共享模块（2026-10-14 重定作用域：常亮只服务番茄钟运行态覆盖界面）。
 *
 * 口径（用户需求 2026-10-14）：
 *  - 屏幕常亮【只在番茄钟运行态生效】——专注倒计时（work-run）/ 休息倒计时
 *    （rest-run）及其间的过渡态（段末振动 / 按钮等待 / 全部完成展示）由
 *    pomodoro.ux 在进入运行态时申请（screenKeepOn）、退出运行态时撤销
 *    （screenKeepOff）。
 *  - 未开启番茄钟时（首页 / 手机同步 / 设置 / 番茄钟配置态）完全不碰系统：
 *    进 App 不再常亮，index 只做延迟读盘 + 亮度断言。
 *
 * 亮度模式 / 亮度值：维持 2026-10-13 口径【默认完全不碰系统】。只有当用户在
 * 设置页显式关掉「自动亮度」（存档 screen.autoBright === false）才
 * setMode(0) + setValue(level)；autoBright 为 true（含全新安装默认值）时
 * 不调 getMode / setMode / getValue / setValue 任何一个。亮度断言由根页面
 * index 读盘完成后执行（screenBrightnessAssert），与常亮解耦。
 *
 * 常亮按设置执行：设置页 keepOn 默认 true；显式关过（存档 keepOn === false）
 * 则不申请。设置对象经共享数据层零 IO 读取（storeGet("screen")），允许传
 * null（无存档 → 按默认开）。
 *
 * 安全性依据（真机结论，非推测）：本项目早期「进 App 卡死」根因是
 * storage.get 读从未写入的 key（已随 file 版 store.js 修复）与启动即执行的
 * setMode(1)（已移除）；单独 setKeepScreenOn 在首页验证过不卡，Sportlink
 * for Vela 亦在 pomodoro 子页 onShow 同款调用，真机正常。
 */
import brightness from "@system.brightness"

const BRIGHT_APPLY_MIN = 10 // 写入系统的亮度下限：0 会让屏幕全黑、无法再操作
const BRIGHT_APPLY_MAX = 255

let gen = 0 // brightness 异步链重入令牌：restore 使在途回调作废
let keepOnApplied = false // 本模块已请求常亮且未撤销
let savedMode = -1 // 改过模式才记（-1 未改，退出不还原）
let savedValue = -1 // 改过亮度才记

function clampLevel(v) {
  const n = Math.round(Number(v))
  if (isNaN(n)) return -1
  return Math.min(Math.max(n, BRIGHT_APPLY_MIN), BRIGHT_APPLY_MAX)
}

function setKeep(on) {
  try {
    brightness.setKeepScreenOn({ keepScreenOn: !!on })
    keepOnApplied = !!on
  } catch (e) {}
}

/**
 * 番茄钟进入运行态（startPhase：专注/休息倒计时）时申请常亮。
 * s = 屏幕设置对象（storeGet("screen")，零 IO；null → 无存档按默认开）。
 * 设置页显式关过常亮（keepOn === false）时不碰系统。
 */
export function screenKeepOn(s) {
  if (s && typeof s === "object" && s.keepOn === false) {
    if (keepOnApplied) setKeep(false)
    return
  }
  setKeep(true)
}

/**
 * 番茄钟退出运行态时撤销常亮（幂等，未申请过则不碰系统）：
 *  - 全部完成自动回配置态（backToConfig）
 *  - 运行中确认退出 / 页面销毁（teardown，含 App 退出）
 */
export function screenKeepOff() {
  if (keepOnApplied) setKeep(false)
}

/**
 * 亮度断言（仅设置页显式关闭「自动亮度」时才写系统）：
 * 由根页面 index 延迟读盘完成后调用。无存档 / 自动亮度（含默认）→ 不碰系统。
 */
export function screenBrightnessAssert(s) {
  const has = !!(s && typeof s === "object")
  if (!has || s.autoBright !== false) return
  const level = clampLevel(s.brightness)
  if (level < 0) return
  const tk = ++gen
  try {
    brightness.getMode({
      success: d => {
        if (tk !== gen) return
        if (!(d && typeof d.mode === "number")) return
        if (savedMode < 0) savedMode = d.mode
        try {
          brightness.setMode({ mode: 0 })
        } catch (e) {}
        try {
          brightness.getValue({
            success: v => {
              if (tk !== gen) return
              if (!(v && typeof v.value === "number")) return
              if (savedValue < 0) savedValue = v.value
              try {
                brightness.setValue({ value: level })
              } catch (e) {}
            }
          })
        } catch (e) {}
      }
    })
  } catch (e) {}
}

/** App 退出（根页面 onDestroy）还原：撤销番茄钟可能挂着的常亮；改过模式/亮度才按原值恢复 */
export function screenKeepRestore() {
  gen++
  screenKeepOff()
  if (savedValue >= 0) {
    try {
      brightness.setValue({ value: savedValue })
    } catch (e) {}
  }
  if (savedMode >= 0) {
    try {
      brightness.setMode({ mode: savedMode })
    } catch (e) {}
  }
  savedMode = -1
  savedValue = -1
}
