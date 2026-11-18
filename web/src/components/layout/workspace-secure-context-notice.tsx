import { App } from "antd";
import { useEffect, useRef } from "react";

import { translate } from "@/i18n";
import { lacksWebCrypto } from "@/lib/secure-context";

const NOTICE_KEY = "workspace-secure-context";

// 生成结果依赖浏览器能力，其中 Web Crypto / Web Locks 只在安全上下文（HTTPS、localhost）暴露。
// 用 http://<ip>:<port> 打开时素材 ID 改走纯 JS 摘要、多标签互斥也降级；作品仍能保存，
// 但双标签同时处理同一任务可能重复写入素材，本机运行时也无法建立安全连接。提前说明，别等出错。
export function WorkspaceSecureContextNotice() {
    const { notification } = App.useApp();
    const shown = useRef(false);

    useEffect(() => {
        if (shown.current || !lacksWebCrypto()) return;
        shown.current = true;
        notification.warning({
            key: NOTICE_KEY,
            title: translate("account.layout.secureContext.title"),
            description: translate("account.layout.secureContext.description"),
        });
    }, [notification]);

    return null;
}
