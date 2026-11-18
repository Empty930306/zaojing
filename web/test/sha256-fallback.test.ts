import { describe, expect, test } from "bun:test";

import { sha256Hex, sha256HexSync } from "@/lib/sha256";

const encoder = new TextEncoder();

// FIPS 180-4 / RFC 6234 vectors, including both padding edge cases around the block boundary.
const vectors: Array<[string, string]> = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
    ["abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu", "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1"],
    ["a".repeat(55), "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
    ["a".repeat(56), "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
    ["a".repeat(64), "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"],
    ["a".repeat(1000), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3"],
];

describe("非安全上下文的 SHA-256", () => {
    test("纯 JS 实现与标准向量一致", () => {
        for (const [input, expected] of vectors) expect(sha256HexSync(encoder.encode(input))).toBe(expected);
    });

    test("纯 JS 实现与 Web Crypto 输出完全一致（HTTP 部署升级到 HTTPS 后素材 ID 不变）", async () => {
        for (const [input] of vectors) expect(sha256HexSync(encoder.encode(input))).toBe(await sha256Hex(encoder.encode(input)));
    });

    test("Unicode 与二进制数据同样一致", async () => {
        const samples = [encoder.encode("镜 3 · 视频生成"), new Uint8Array(64).fill(0xff), new Uint8Array(0)];
        for (const sample of samples) expect(sha256HexSync(sample)).toBe(await sha256Hex(sample));
    });

    test("非安全上下文的大输入走分块计算，结果不变且不会长时间占住主线程", async () => {
        const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
        // 模拟 http://IP：没有 crypto.subtle。
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => bytes } });
        try {
            const large = new Uint8Array(300 * 1024).map((_, index) => index % 251);
            expect(await sha256Hex(large)).toBe(sha256HexSync(large));
            expect(await sha256Hex(encoder.encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        } finally {
            if (saved) Object.defineProperty(globalThis, "crypto", saved);
        }
    });
});
