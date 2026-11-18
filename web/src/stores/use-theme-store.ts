import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

const VALID_THEMES: ThemeName[] = ["light", "dark"];

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            // 写入前校验：非法 theme 直接忽略，防止 syncRemoteUserData 等路径绕过 merge 写入坏值
            setTheme: (next) => set((state) => (VALID_THEMES.includes(next) ? { theme: next } : state)),
        }),
        {
            name: "yingce:theme_store",
            // 持久化恢复校验：旧版本/坏 session 写入的非法值回退到 light，
            // 避免 canvasThemes[非法值] = undefined 触发 "reading 'node'" 崩溃
            merge: (persisted, current) => {
                const stored = (persisted || {}) as Partial<ThemeStore>;
                const theme = VALID_THEMES.includes(stored.theme as ThemeName)
                    ? (stored.theme as ThemeName)
                    : "light";
                return { ...current, theme };
            },
        },
    ),
);

/** 站点默认主题的缓存，index.html 首帧脚本读取它避免深色站闪白。 */
const SITE_DEFAULT_THEME_CACHE_KEY = "yingce:site_theme_default";
/** 已经强制应用过的默认主题值；相同值不再重复覆盖用户手动选择。 */
const SITE_DEFAULT_THEME_APPLIED_KEY = "yingce:site_theme_default_applied";

/**
 * 站点默认主题由管理员在后台配置，修改后对全站用户强制生效一次。
 * 之后用户自己切换主题会保留，直到管理员再次修改默认值。
 */
export function applySiteDefaultTheme(next: ThemeName) {
    if (!VALID_THEMES.includes(next)) return;
    try {
        localStorage.setItem(SITE_DEFAULT_THEME_CACHE_KEY, next);
        if (localStorage.getItem(SITE_DEFAULT_THEME_APPLIED_KEY) === next) return;
        localStorage.setItem(SITE_DEFAULT_THEME_APPLIED_KEY, next);
    } catch {
        // 隐私模式下 localStorage 不可用时只在本次会话内生效。
    }
    useThemeStore.getState().setTheme(next);
}
