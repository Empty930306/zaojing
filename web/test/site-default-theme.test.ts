import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { applySiteDefaultTheme, useThemeStore } from "../src/stores/use-theme-store";

const storage = new Map<string, string>();
let originalLocalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        },
    });
});

afterEach(() => {
    useThemeStore.setState({ theme: "light" });
    if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("site default theme", () => {
    test("applies the admin default to every visitor once", () => {
        useThemeStore.setState({ theme: "light" });

        applySiteDefaultTheme("dark");

        expect(useThemeStore.getState().theme).toBe("dark");
        expect(storage.get("yingce:site_theme_default")).toBe("dark");
        expect(storage.get("yingce:site_theme_default_applied")).toBe("dark");
    });

    test("keeps a manual choice until the admin changes the default again", () => {
        applySiteDefaultTheme("dark");
        useThemeStore.getState().setTheme("light");

        // 同一次默认值刷新不能把用户手动切换后的主题覆盖回去。
        applySiteDefaultTheme("dark");
        expect(useThemeStore.getState().theme).toBe("light");
        // 首帧缓存仍记录站点默认值，供未访问过的用户使用。
        expect(storage.get("yingce:site_theme_default")).toBe("dark");

        // 管理员改成浅色后再强制一次。
        applySiteDefaultTheme("light");
        expect(useThemeStore.getState().theme).toBe("light");
        expect(storage.get("yingce:site_theme_default_applied")).toBe("light");
    });

    test("ignores values outside light and dark", () => {
        useThemeStore.setState({ theme: "light" });

        applySiteDefaultTheme("sepia" as "light");

        expect(useThemeStore.getState().theme).toBe("light");
        expect(storage.get("yingce:site_theme_default")).toBeUndefined();
    });

    test("still applies the theme when storage is unavailable", () => {
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: () => {
                    throw new Error("blocked");
                },
                setItem: () => {
                    throw new Error("blocked");
                },
                removeItem: () => {
                    throw new Error("blocked");
                },
            },
        });
        useThemeStore.setState({ theme: "light" });

        applySiteDefaultTheme("dark");

        expect(useThemeStore.getState().theme).toBe("dark");
    });
});
