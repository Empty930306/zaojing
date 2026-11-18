// SHA-256 与“非安全上下文可用”的兜底实现。
//
// `crypto.subtle` 只在安全上下文（HTTPS / localhost / 127.0.0.1）暴露。用
// `http://<ip>:<port>` 打开的真实部署里它是 undefined，而素材 ID、重试幂等键、画布
// continuation ID 和画布内容摘要都靠 SHA-256 派生；直接抛错会让“作品已生成”变成
// “结果暂未同步”。
//
// 两条路径必须给出同一个摘要：同一份 effectKey 在 HTTP 与 HTTPS 下要落到同一个素材 ID，
// 否则升级 TLS 后会派生第二份素材、重试幂等也会悄悄失效。

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
]);

const INITIAL_STATE = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** 非安全上下文里同步处理大块数据的卡顿阈值：超过它就分批让出事件循环。 */
const COOPERATIVE_CHUNK_BYTES = 64 * 1024;

function rotr(value: number, bits: number) {
    return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** 按 FIPS 180-4 补齐到 512 位块；返回值包含总块字节数。 */
function padded(input: Uint8Array) {
    const bitLength = input.length * 8;
    const paddedLength = ((((input.length + 8) >> 6) + 1) << 6) >>> 0;
    const buffer = new Uint8Array(paddedLength);
    buffer.set(input);
    buffer[input.length] = 0x80;
    const view = new DataView(buffer.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    return { buffer, view, paddedLength };
}

function compress(state: number[], w: Uint32Array, view: DataView, offset: number) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
        const s0 = rotr(w[index - 15]!, 7) ^ rotr(w[index - 15]!, 18) ^ (w[index - 15]! >>> 3);
        const s1 = rotr(w[index - 2]!, 17) ^ rotr(w[index - 2]!, 19) ^ (w[index - 2]! >>> 10);
        w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state as [number, number, number, number, number, number, number, number];
    for (let index = 0; index < 64; index += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + s1 + ch + K[index]! + w[index]!) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
}

function hexState(state: number[]) {
    return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** 与 `crypto.subtle.digest("SHA-256", data)` 完全一致；不依赖 Web Crypto。 */
export function sha256HexSync(input: Uint8Array): string {
    const { view, paddedLength } = padded(input);
    const state = [...INITIAL_STATE];
    const w = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) compress(state, w, view, offset);
    return hexState(state);
}

/**
 * 让出主线程。嵌套的 setTimeout 会被浏览器钳制到 4ms，几十兆视频会累积成上百次
 * 卡顿，所以优先用不受计时器钳制的 MessageChannel。
 */
function yieldToEventLoop() {
    if (typeof MessageChannel !== "function") return new Promise<void>((resolve) => setTimeout(resolve, 0));
    return new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
}

/**
 * 大输入分块计算：每 64 KiB 让出一次事件循环，避免画布内容摘要或历史媒体摘要
 * 在 HTTP 部署里同步阻塞主线程（会造成输入卡顿、拖拽掉帧）。
 */
async function sha256HexCooperative(input: Uint8Array): Promise<string> {
    const { view, paddedLength } = padded(input);
    const state = [...INITIAL_STATE];
    const w = new Uint32Array(64);
    const blocksPerChunk = Math.max(1, Math.floor(COOPERATIVE_CHUNK_BYTES / 64));
    for (let offset = 0, processed = 0; offset < paddedLength; offset += 64, processed += 1) {
        if (processed > 0 && processed % blocksPerChunk === 0) await yieldToEventLoop();
        compress(state, w, view, offset);
    }
    return hexState(state);
}

function hexFromBytes(bytes: Uint8Array): string {
    let hex = "";
    for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
    return hex;
}

/** SHA-256 十六进制摘要：安全上下文走 Web Crypto，否则走等价的纯 JS 实现。 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return data.length > COOPERATIVE_CHUNK_BYTES ? sha256HexCooperative(data) : sha256HexSync(data);
    // 普通 ArrayBuffer 视图直接复用，避免给大视频/图片再复制一份；
    // 共享缓冲区（SharedArrayBuffer）的视图不能交给 subtle，需要复制到独立缓冲区。
    const bytes = data.buffer instanceof ArrayBuffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
    return hexFromBytes(new Uint8Array(await subtle.digest("SHA-256", bytes)));
}

export function sha256HexOf(value: string): Promise<string> {
    return sha256Hex(new TextEncoder().encode(value));
}
