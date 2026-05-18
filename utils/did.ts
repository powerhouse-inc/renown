export function didKeyText(didKey: string) {
    return didKey.length < 20 ? didKey : `${didKey.slice(0, 5)}...${didKey.slice(-5)}`;
}

export function formatDid(did: string): string {
    if (did.length <= 24) return did;
    return `${did.slice(0, 16)}...${did.slice(-8)}`;
}