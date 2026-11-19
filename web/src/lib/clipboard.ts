// 写入系统剪贴板。
//
// `navigator.clipboard` 只在安全上下文（HTTPS、localhost、127.0.0.1）暴露：用
// `http://<ip>:<port>` 打开的真实部署里它是 undefined，直接调用 `writeText` 会抛
// TypeError，导致全站「复制」都报失败。这与 v1.8.8 修过的 `crypto.subtle` 同类。
//
// `copy-to-clipboard` 先判断安全上下文，不可用时同步退回隐藏节点加 `execCommand("copy")`；
// 同步回退很关键，晚一步执行就不再算用户激活手势。
//
// 返回 true 表示已写入；调用方据此决定提示「已复制」还是「请手动选择文本」。

import copy from "copy-to-clipboard";

export async function copyPlainText(text: string): Promise<boolean> {
    if (!text) return false;
    try {
        return await copy(text);
    } catch {
        return false;
    }
}
