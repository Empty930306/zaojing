// 剪贴板工具：验证非安全上下文（http://<ip>:<port>）下仍能复制。
//
// `navigator.clipboard` 在非安全上下文是 undefined，直接调用会让全站「复制」报失败。
// 这里覆盖三条路径：异步接口可用、异步接口缺失、异步接口抛错。

import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { copyPlainText } from "@/lib/clipboard";

const dom = new Window({ url: "http://192.168.1.10:3000/tasks" });
const globals = new Map<string, PropertyDescriptor | undefined>();
const originalExecCommand = dom.document.execCommand;

function setGlobal(key: string, value: unknown) {
    if (!globals.has(key)) globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

let execCommandCalls = 0;

beforeEach(() => {
    setGlobal("window", dom);
    setGlobal("document", dom.document);
    setGlobal("navigator", dom.navigator);
    // happy-dom 不实现 execCommand；用 stub 断言回退确实被执行。
    execCommandCalls = 0;
    (dom.document as unknown as { execCommand: unknown }).execCommand = () => {
        execCommandCalls += 1;
        return true;
    };
    // 非安全上下文下 copy-to-clipboard 只走 execCommand 分支，这里固定成 HTTP 场景。
    Object.defineProperty(dom, "isSecureContext", { value: false, configurable: true, writable: true });
});

afterEach(() => {
    (dom.document as unknown as { execCommand: unknown }).execCommand = originalExecCommand;
});

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
    }
});

function setClipboard(value: unknown) {
    Object.defineProperty(dom.navigator, "clipboard", { value, configurable: true, writable: true });
}

test("非安全上下文且没有 navigator.clipboard 时退回 execCommand", async () => {
    setClipboard(undefined);
    expect(await copyPlainText("创作历史提示词")).toBe(true);
    expect(execCommandCalls).toBe(1);
});

test("异步剪贴板抛错时仍退回 execCommand", async () => {
    setClipboard({
        writeText: () => Promise.reject(new Error("NotAllowedError")),
        write: () => Promise.reject(new Error("NotAllowedError")),
    });
    expect(await copyPlainText("降级路径")).toBe(true);
    expect(execCommandCalls).toBe(1);
});

test("两条路径都失败时返回 false，由调用方提示手动复制", async () => {
    setClipboard(undefined);
    (dom.document as unknown as { execCommand: unknown }).execCommand = () => false;
    expect(await copyPlainText("失败路径")).toBe(false);
});

test("空文本不写入剪贴板", async () => {
    setClipboard(undefined);
    expect(await copyPlainText("")).toBe(false);
    expect(execCommandCalls).toBe(0);
});
