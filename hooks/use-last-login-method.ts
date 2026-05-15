import { useSyncExternalStore } from "react";
import { LoginMethod } from "../services/wallet/types";

const STORAGE_KEY = "renown:last-login-method";

const isLoginMethod = (value: unknown): value is LoginMethod =>
    typeof value === "string" &&
    (Object.values(LoginMethod) as string[]).includes(value);

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
    };
};

const getSnapshot = (): LoginMethod | null => {
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return isLoginMethod(value) ? value : null;
    } catch {
        return null;
    }
};

const getServerSnapshot = (): LoginMethod | null => null;

export function useLastLoginMethod(): LoginMethod | null {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setLastLoginMethod(method: LoginMethod): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, method);
    } catch {
        // ignore storage failures (private mode, quota, etc.)
    }
    for (const listener of listeners) listener();
}

export function clearLastLoginMethod(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore storage failures
    }
    for (const listener of listeners) listener();
}
