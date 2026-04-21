export function didKeyText(didKey: string) {
    return didKey.length < 20 ? didKey : `${didKey.slice(0, 5)}...${didKey.slice(-5)}`;
}