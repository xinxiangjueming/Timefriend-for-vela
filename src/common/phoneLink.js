/**
 * 手表→手机 数据通道（小米 Vela interconnect / LiFD）。
 *
 * 严格遵循 vela-interconnect-sync 开发手册（真机实测结论）：
 *  1) 实例早建：由同步页 onInit 延时建立并注册回调（幂等，跨页面存活）。
 *     绝不等按按钮才建——手机侧 launchWearApp 拉起本页建立会话时，onopen 在
 *     页面生命周期早期触发；等按按钮才建必然错过 onopen（引擎不会补发），
 *     手机随后发的 hs/req 也无人接收，链路永远死在 (O)，数据永远发不出去。
 *  2) 可用性判定以【应用层握手真实往返】为准，不信引擎 onopen（会话打开≠对端
 *     可达）：收到手机 hs(c=0) 回 c=1，或本端发出 hs(c=0) 收到 c=1，任一即
 *     hsDone。握手带【有界重试】（3 次 / 1.5s）：报文会被静默丢弃，重试可恢复。
 *  3) 报文载荷发【对象】，绝不发 JSON.stringify 后的字符串——字符串载荷在部分
 *     表型被通道静默丢弃（引擎报成功、对端零收到）。
 *  4) 失败时把阶段编码写进 UI（idle/na/O/H + R），表端无日志只能靠失败码定位。
 *  5) 会话实例跨页面存活；页面 onDestroy 只清应用层 handler，不清连接实例/onmessage。
 *
 * 会话建立顺序（手机侧主导）：手机 getConnectedNodes → requestPermission(DEVICE_MANAGER)
 * → addListener → launchWearApp(nodeId,"/pages/sync") → 表端 onopen（或探测握手成功）
 * → 应用层握手 hs 往返 → 双向可用 → 业务传输。本模块只负责表端这一侧。
 */
import interconnect from "@system.interconnect"

let conn = null
let inited = false // 实例是否已尝试创建（幂等，跨页面只建一次）
let opened = false // onopen 已触发
let hsDone = false // 应用层握手完成（真实往返，双向可用）
let appHandler = null // 应用层消息回调（页面注册，onDestroy 清空）
let pendingPomo = null // 未连接时最新的番茄钟数据（latest-wins，避免堆积）
const MAX_QUEUE = 8
const queue = [] // 其他普通报文的有界等待队列
const HS_TRIES = 3 // 握手有界重试次数（手册：≤2~3 次）
const HS_RETRY_MS = 1500 // 握手重试间隔
let probeTimer = -1
let probeTries = 0

/**
 * 建实例 + 注册回调（幂等）。调用时机：同步页 onInit 延时 300ms（页面渲染
 * 稳定后早建）；用户点「立即同步」时兜底再调一次（同为幂等路径）。
 * 历史卡死确证案例是【启动期顶层创建】与【storage 读不存在的 key】，此处均
 * 已避开；即使 onopen 仍被错过，下方有界握手探测也能从「会话已开但回调缺席」
 * 的补建场景中恢复链路。
 */
function ensureConn() {
  if (inited) return conn
  inited = true
  try {
    conn = interconnect.instance() || null
  } catch (e) {
    conn = null
  }
  if (conn) {
    conn.onopen = () => {
      opened = true
      startProbe() // 会话打开≠双向可用：以应用层握手往返为准
    }
    conn.onerror = () => {
      opened = false
      hsDone = false
      stopProbe()
    }
    conn.onmessage = res => {
      const p = normalize(res)
      if (!p) return
      if (p.t === "hs") {
        // c=0：手机发起的握手 → 回 c=1；c=1：手机对本端探测的应答。
        // 任一到达都证明双向报文走通（比引擎 onopen 更可信）
        hsDone = true
        stopProbe()
        if (p.c === 0) rawSend({ t: "hs", c: 1 })
        flush()
        return
      }
      if (appHandler) appHandler(p)
    }
    // 实例建好即探测：覆盖「手机已 launchWearApp 建好会话、但本端实例建晚了
    // 错过 onopen」的补建场景（懒建方案踩过的坑，探测是兜底恢复手段）
    startProbe()
  }
  return conn
}

/** 有界握手探测：发 hs(c=0)，手机回 hs(c=1) 即双向可用（onmessage 置 hsDone 并停表） */
function startProbe() {
  if (hsDone) return
  stopProbe()
  probeTries = HS_TRIES
  probeStep()
}

function probeStep() {
  if (hsDone || !conn) return
  try {
    conn.send({ data: { t: "hs", c: 0 }, success: () => {}, fail: () => {} })
  } catch (e) {}
  probeTries--
  if (probeTries <= 0) return
  probeTimer = setTimeout(probeStep, HS_RETRY_MS)
}

function stopProbe() {
  if (probeTimer >= 0) {
    clearTimeout(probeTimer)
    probeTimer = -1
  }
}

/** 载荷形态归一：引擎可能给 res / res.data / res.data.data，或字符串 JSON */
function normalize(res) {
  let p = res
  if (p && typeof p === "object") {
    if (p.data !== undefined) p = p.data
    if (p && typeof p === "object" && p.data !== undefined) p = p.data
  }
  if (typeof p === "string") {
    try {
      p = JSON.parse(p)
    } catch (e) {
      return null
    }
  }
  return p && typeof p === "object" ? p : null
}

function rawSend(obj) {
  if (!conn || !hsDone) return false
  try {
    conn.send({
      data: obj,
      success: () => {},
      fail: () => {}
    })
    return true
  } catch (e) {
    return false
  }
}

function flush() {
  if (!hsDone) return
  if (pendingPomo) {
    rawSend({ t: "pomo", d: pendingPomo })
    pendingPomo = null
  }
  while (queue.length) {
    rawSend(queue.shift())
  }
}

/** 建实例（同步页 onInit 延时调一次；点「立即同步」兜底；幂等）。
 *  链路未就绪时重新武装握手探测 = 用户可手动重试握手。 */
export function ensurePhoneLink() {
  ensureConn()
  if (conn && !hsDone) startProbe()
}

/** 注册应用层消息回调（页面 onInit 调；onDestroy 调 onPhoneMessage(null) 清空） */
export function onPhoneMessage(fn) {
  appHandler = typeof fn === "function" ? fn : null
}

/** 通道是否真正可用（握手完成） */
export function isPhoneLinked() {
  return !!conn && hsDone
}

/** 当前连接阶段，供 UI 失败码展示：
 *  idle=实例未建（进页尚未初始化，≠不支持）/ na=实例创建失败（真不支持）
 *  O=onopen未触发且握手无应答（手机未 launchWearApp）/ H=会话已开但握手未过
 *  ready=握手往返成功（双向可用） */
export function linkStage() {
  if (!inited) return "idle"
  if (!conn) return "na"
  if (hsDone) return "ready"
  if (opened) return "H"
  return "O"
}

/** 发送任意业务报文对象；未连接则进有界队列，连接后 flush。返回是否已立即发出 */
export function sendToPhone(obj) {
  if (!conn || !hsDone) {
    if (queue.length < MAX_QUEUE) queue.push(obj)
    return false
  }
  return rawSend(obj)
}

/**
 * 同步番茄钟周期到手机。payload 为逐条记录数组（与手机 PomodoroSessionEntity 一一对应）：
 *   [{ date:"YYYY-MM-DD", focusMinutes:30, restMinutes:10, createdAt: <epochMs> }, ...]
 * createdAt 为周期完成时刻的稳定时间戳，手机端据此幂等写入（重复同步不产生重复行）。
 * 未连接时保留【最新】一份（latest-wins），连上即发，避免堆积重复。
 */
export function syncPomodoro(payload) {
  pendingPomo = payload || null
  if (!conn || !hsDone) return false
  const ok = rawSend({ t: "pomo", d: pendingPomo })
  if (ok) pendingPomo = null
  return ok
}

export function isInterconnectAvailable() {
  return !!conn
}
