import { describe, expect, test } from "bun:test";
import { CONTENT_MODERATION_MESSAGE, generationErrorMessage, generationFailureMetadata } from "../src/lib/generation-error";
import { STORAGE_LIMIT_REASONS } from "../src/lib/workspace-storage";

test("Agent history quota explains recovery without offering file storage", () => {
    const reason = "agent_history_capacity_exceeded";
    expect(generationErrorMessage({ reason })).toContain("管理员");
    expect(generationErrorMessage({ reason })).not.toMatch(/充值|购买|素材/);
    expect(STORAGE_LIMIT_REASONS.has(reason)).toBe(false);
    expect(STORAGE_LIMIT_REASONS.has("storage_capacity_exceeded")).toBe(true);
});

describe("safe upstream error details", () => {
    const detail = "非常抱歉，生成的图片可能违反了关于裸露、色情或情色内容的防护限制。请重试或修改提示语。";
    test("drops upstream detail from the card", () => {
        const message = `模型服务拒绝了请求，请检查模型和参数；上游：${detail}`;
        expect(generationErrorMessage(new Error(message))).toBe("模型服务拒绝了请求，请检查模型和参数");
    });
    test("does not replace a safe upstream message with a generic HTTP hint", () => {
        const message = `模型服务暂时不可用（HTTP 500）；上游：${detail}`;
        expect(generationErrorMessage(message)).toBe("模型服务暂时不可用，请稍后再试。");
        expect(generationErrorMessage("模型服务暂时不可用（HTTP 500）")).toBe("模型服务暂时不可用，请稍后再试。");
    });
    test("keeps details when moderation metadata is stored", () => {
        const message = `内容审核未通过；上游：${detail}`;
        const metadata = generationFailureMetadata(message, "test prompt");
        expect(metadata.errorDetails).toBe(CONTENT_MODERATION_MESSAGE);
        expect(metadata.generationErrorCode).toBe("sensitive_words_detected");
    });
    test("gives actionable hints for known upstream failures", () => {
        expect(generationErrorMessage(`模型服务暂时不可用（HTTP 503）；上游：model_not_found request id abc`)).toContain("更换模型");
        expect(generationErrorMessage(`模型服务拒绝请求；上游：image file too large 25MB`)).toContain("压缩图片");
    });
    test("upstream marker does not bypass URL hiding", () => {
        expect(generationErrorMessage("模型服务请求失败；上游：https://private.test")).toBe("模型服务请求失败");
    });
});

describe("浏览器侧失败不能伪装成模型失败", () => {
    // 事故：http://IP 部署没有 crypto.subtle，保存生成素材抛 TypeError，
    // 被技术文本规则改写成“模型服务处理失败”，用户以为换模型即可（实际作品已在后台）。
    test("缺少 Web Crypto 时说明浏览器限制，并只引导重新获取", () => {
        const error = new TypeError("Cannot read properties of undefined (reading 'digest')");
        const message = generationErrorMessage(error);
        expect(message).toContain("Web Crypto");
        expect(message).toContain("重新获取结果");
        expect(message).not.toContain("模型");
    });
    test("crypto 未定义与缺少 Web Locks 同样不落到模型文案", () => {
        expect(generationErrorMessage(new Error("crypto is not defined"))).toContain("Web Crypto");
        expect(generationErrorMessage("Cannot read properties of undefined (reading 'request')  navigator.locks")).toContain("Web Crypto");
    });
    test("本地存储写满时提示清理浏览器数据，而不是换模型", () => {
        const error = new Error("Failed to execute 'setItem' on 'Storage': QuotaExceededError");
        expect(generationErrorMessage(error)).toContain("清理浏览器数据");
        expect(generationErrorMessage(error)).not.toContain("模型服务处理失败");
    });
    test("真正的上游失败仍然走模型服务文案", () => {
        expect(generationErrorMessage("invalid_request_error: unsupported media payload")).toBe("模型服务处理失败，请稍后重试或换用其他模型。");
    });
});
