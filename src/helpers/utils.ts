export function delay(delayDuration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayDuration));
}
