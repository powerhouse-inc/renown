import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => typeof indexedDB !== "undefined";
const getServerSnapshot = () => false;

export function useIsClient(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
