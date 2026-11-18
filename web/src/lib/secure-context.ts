// 保存生成结果依赖 Web Crypto（素材 ID、幂等键、内容摘要都是 SHA-256 派生）。
// `crypto.subtle` 只在安全上下文（HTTPS、localhost、127.0.0.1）暴露，用 http://<ip>:<port>
// 打开的真实部署拿不到它。这里统一判断，供工作区在进入时提前说明，而不是等生成完成才暴露。
//
// 缺少它现在有纯 JS 摘要兜底，所以只是提醒而不是阻断；Web Locks 与它同属安全上下文能力，
// 缺失只影响多标签互斥，单独缺失时不需要提醒。

export function lacksWebCrypto() {
    if (typeof window === "undefined") return false;
    return !globalThis.crypto?.subtle;
}
