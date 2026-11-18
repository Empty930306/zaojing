import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { lacksWebCrypto } from "@/lib/secure-context";

// 事故：服务器以 http://IP:3000 打开时是非安全上下文，crypto.subtle 不存在，
// 素材 ID 无法用 Web Crypto 派生。这里显式模拟该环境。
const saved = new Map<string, PropertyDescriptor | undefined>();

function defineGlobal(key: string, value: unknown) {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

beforeAll(() => defineGlobal("window", globalThis));
afterAll(() => {
    for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

describe("非安全上下文探测", () => {
    test("HTTPS（有 Web Crypto）时无需提示", () => {
        defineGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
        expect(lacksWebCrypto()).toBe(false);
    });

    test("http://IP 部署缺少 crypto.subtle 时提示", () => {
        defineGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes });
        expect(lacksWebCrypto()).toBe(true);
    });

    test("只有 Web Locks 缺失不算保存失败（已有进程内互斥降级）", () => {
        defineGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
        defineGlobal("navigator", {});
        expect(lacksWebCrypto()).toBe(false);
    });
});
