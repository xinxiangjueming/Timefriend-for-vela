/**
 * 共享数据层（2026-10-14 第五次重写：file 单键单文件 + Sportlink 同款写泵，零 storage）。
 *
 * 路线定案依据（本表实测，两次卡死实证）：
 *  - @system.storage 在本表固件上不可用：storage.get 碰【从未写入过的 key】必卡死
 *    （v5 时代首页 4 连读卡死 + 2026-10-14 03:10 串行单 get 仍卡死，两次二分实证）。
 *    「串行就能救」的翻案说法已撤销——Sportlink 那块表 storage 正常属于设备差异
 *    （Vela 各设备 API 支持碎片化，如 8Pro 无网络请求）。
 *  - @system.file 全程从未卡死（file 版 store 两个版本均正常运行），且 list /
 *    readArrayBuffer / writeArrayBuffer（含新建文件）在本表经 Sportlink FIT 长期
 *    验证。v4 file 版「重启回默认」的根因是写盘纪律缺失，不是 file 接口本身：
 *    Sportlink 2026-10-05 FIT 损坏实证过同一类坑——无写泵的并发 writeArrayBuffer +
 *    无引用 buffer 被回收复用，迟到的整文件覆盖写把【堆垃圾写进文件】，下次启动
 *    JSON.parse 失败 → 全部回落默认值。
 *
 * 本版结构（照抄 Sportlink FIT 写盘纪律）：
 *  - 每键一个独立文件（tf_<key>.json）：单键损坏只丢该键，不连坐；读缺失键 =
 *    用默认值，不写空文件。
 *  - 写泵：同一时刻仅一个 writeArrayBuffer 在途（回调回来才发下一个），buffer
 *    保活到回调（S.pumpBuf），success/fail 都接——与 Sportlink workout.ux 完全同款。
 *  - 读侧串行：file.list 一次枚举 → 存在的键逐个 readArrayBuffer（同一时刻一个）。
 *  - 内存权威挂 globalThis（store 模块被按页面复制，build 实证，四份副本必须
 *    操作同一个全局对象）。
 *
 * 用法不变：index 进 App 延时调 storeLoad()（主读盘）；子页面 storeIsLoaded() 为
 * false 时也调 storeLoad() 兜底（在途时只挂 done 回调，复用同一条链）；其余场合
 * 一律 storeGet / storeSet（storeSet 只入泵，不阻塞页面）。
 */
import file from "@system.file"

const DIR = "internal://files/"
const KEY_FILES = {
  screen: "tf_screen.json",
  cfg: "tf_cfg.json",
  stats: "tf_stats.json",
  sessions: "tf_sessions.json"
}
const KEY_NAMES = ["screen", "cfg", "stats", "sessions"]

function toU8(s) {
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff
  return u
}

function fromU8(u) {
  let s = ""
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return s
}

function normU8(d) {
  try {
    if (d instanceof Uint8Array) return d
    if (d && d.buffer instanceof Uint8Array) return d.buffer
    if (d && d.buffer) return new Uint8Array(d.buffer)
    if (d instanceof ArrayBuffer) return new Uint8Array(d)
  } catch (e) {}
  return null
}

/** 值合法性守卫：screen/cfg/stats 须为对象，sessions 须为数组，其余拒绝入库 */
function validFor(k, v) {
  if (v === null || typeof v !== "object") return false
  return k === "sessions" ? Array.isArray(v) : !Array.isArray(v)
}

// 全局单例（跨页面 chunk 共享）
const g = globalThis
if (!g.__timefriendStore) {
  g.__timefriendStore = {
    data: { screen: null, cfg: null, stats: null, sessions: null },
    loaded: false,
    loading: false,
    doneCbs: [], // 读盘完成回调（并发调用排队，读完后统一触发）
    pumpBusy: false, // 写泵在途标志
    pumpQ: [], // 待写队列 [{k, text}]
    pumpBuf: null // 在途写 buffer 引用（保活到回调，防回收复用写垃圾）
  }
}
const S = g.__timefriendStore

export function storeGet(k) {
  return S.data[k]
}

/** 内存为权威 + 入写泵落盘（串行，见 pumpStep；Sportlink FIT 写盘同款纪律） */
export function storeSet(k, v) {
  S.data[k] = v
  S.pumpQ.push({ k: k, text: JSON.stringify(v) })
  pumpStep()
}

function pumpDone() {
  S.pumpBusy = false
  S.pumpBuf = null
  pumpStep()
}

function pumpStep() {
  if (S.pumpBusy) return
  const job = S.pumpQ.shift()
  if (!job) return
  S.pumpBusy = true
  S.pumpBuf = toU8(job.text) // 保活到回调：无引用 buffer 被复用会把堆垃圾写进文件
  try {
    file.writeArrayBuffer({
      uri: DIR + KEY_FILES[job.k],
      buffer: S.pumpBuf,
      append: false,
      success: () => pumpDone(),
      fail: () => pumpDone() // 写失败静默：内存仍是权威，下次 storeSet 重写该键
    })
  } catch (e) {
    pumpDone()
  }
}

export function storeIsLoaded() {
  return S.loaded
}

/**
 * 读盘（幂等，多页/多页实例并发安全）：首个调用发起链，其余挂 done 回调，
 * 读完后统一触发。file.list 一次枚举 → 存在的键逐个串行 readArrayBuffer；
 * 缺失/损坏的键保持默认值（不写空文件、不连坐其它键）。
 */
export function storeLoad(done) {
  if (S.loaded) {
    if (done) done()
    return
  }
  if (done) S.doneCbs.push(done)
  if (S.loading) return
  S.loading = true

  const finish = () => {
    S.loaded = true
    S.loading = false
    const cbs = S.doneCbs
    S.doneCbs = []
    for (let j = 0; j < cbs.length; j++) {
      try {
        cbs[j]()
      } catch (e) {}
    }
  }

  // 必须用本地队列副本：直接对模块级 KEY_NAMES shift() 会在首轮读盘后把它
  // 消耗空，storeReset()（进程存活的二次进 App）后再 storeLoad 会立即 finish()
  // ——一个键都读不到，数据层全部回落默认值（2026-10-14 审查发现）
  const queue = KEY_NAMES.slice(0)
  const readNext = present => {
    const k = queue.shift()
    if (!k) {
      finish()
      return
    }
    if (!present[k]) {
      readNext(present) // 该键从未写过：保持默认值
      return
    }
    try {
      file.readArrayBuffer({
        uri: DIR + KEY_FILES[k],
        success: raw => {
          const u = normU8(raw)
          if (u && u.length) {
            try {
              const v = JSON.parse(fromU8(u))
              if (validFor(k, v)) S.data[k] = v
            } catch (e) {} // 损坏：该键回落默认值，不连坐其它键
          }
          readNext(present)
        },
        fail: () => readNext(present)
      })
    } catch (e) {
      readNext(present)
    }
  }

  try {
    file.list({
      uri: DIR,
      success: d => {
        const arr = d && d.fileList ? d.fileList : Array.isArray(d) ? d : []
        const present = {}
        for (let i = 0; i < arr.length; i++) {
          const u = (arr[i] && arr[i].uri) || ""
          for (let j = 0; j < KEY_NAMES.length; j++) {
            if (u.indexOf(KEY_FILES[KEY_NAMES[j]]) >= 0) present[KEY_NAMES[j]] = true
          }
        }
        readNext(present)
      },
      fail: () => finish()
    })
  } catch (e) {
    finish()
  }
}

/** 退出 App 时复位（index onDestroy）：内存清空，下次进 App 重新读 */
export function storeReset() {
  S.loaded = false
  S.loading = false
  S.doneCbs = []
  S.data = { screen: null, cfg: null, stats: null, sessions: null }
}
