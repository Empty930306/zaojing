import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MediaResult } from "@/pages/create/creation-workspace-messages";
import type { CreationMessage } from "@/pages/create/creation-types";
import { INSECURE_CONTEXT_MESSAGE } from "@/lib/generation-error";

const noop = () => {};
const at = "2026-11-18T08:10:00.000Z";

function renderResult(item: Partial<CreationMessage>) {
    return renderToStaticMarkup(
        <MediaResult
            item={{ id: "assistant-1", role: "assistant", mode: "video", content: "生成失败", createdAt: at, status: "error", taskIds: ["task-1"], ...item }}
            onRetryFailure={noop}
            onRefreshResult={noop}
            onRecoverMedia={noop}
            onCreateVariant={noop}
            onContinueCanvas={noop}
            openingCanvas={false}
        />,
    );
}

const insecureContextError = new TypeError("Cannot read properties of undefined (reading 'digest')");

describe("HTTP 明文部署的失败卡片不再误导成模型问题", () => {
    test("缺少 Web Crypto 时只引导重新获取结果，不出现重新生成", () => {
        // 事故现场：作品已在后台生成成功，页面因 crypto.subtle 缺失存不进素材库。
        const markup = renderResult({ error: insecureContextError.message, errorKind: "sync" });
        expect(markup).toContain("结果没能保存到素材库");
        expect(markup).toContain("Web Crypto");
        expect(markup).toContain("重新获取结果");
        // 没有“重新生成”按钮（rot-ccw 图标）：换了模型也一样保存不了，只会再扣一次费。
        expect(markup).not.toContain("lucide-rotate-ccw");
        expect(markup).not.toContain("模型服务处理失败");
        expect(markup).not.toContain("结果暂未同步");
    });

    test("本地存储写满同样按浏览器限制处理", () => {
        const markup = renderResult({ error: "Failed to execute 'setItem' on 'Storage': QuotaExceededError", errorKind: "sync" });
        expect(markup).toContain("清理浏览器数据");
        expect(markup).not.toContain("lucide-rotate-ccw");
    });

    test("已经存成收敛文案的旧记录也能识别成浏览器侧失败", () => {
        // 消息持久化的 error 是映射后的文字（历史 payload 不再存原始 TypeError）。
        const markup = renderResult({ error: INSECURE_CONTEXT_MESSAGE, errorKind: "sync" });
        expect(markup).toContain("结果没能保存到素材库");
        expect(markup).not.toContain("结果暂未同步");
    });

    test("普通“页面没跟上”仍是结果待同步，可重新获取也可重新生成", () => {
        const markup = renderResult({ error: "网络异常。", errorKind: "sync" });
        expect(markup).toContain("结果暂未同步");
        expect(markup).toContain("重新生成");
    });

    test("旧记录里被收敛成“模型服务处理失败”的原因不再和“结果待同步”并列", () => {
        // 线上现有记录：没有 errorKind，只剩这句通用原因，展示出来会自相矛盾。
        const markup = renderResult({ error: "模型服务处理失败，请稍后重试或换用其他模型。" });
        expect(markup).toContain("结果暂未同步");
        expect(markup).toContain("旧版本");
        expect(markup).not.toContain("模型服务处理失败");
    });

    test("后端确认失败仍然是生成失败卡片", () => {
        const markup = renderResult({ error: "模型服务处理失败，请稍后重试或换用其他模型。", errorKind: "task" });
        expect(markup).toContain("生成失败");
        expect(markup).not.toContain("结果没能保存到素材库");
    });
});
