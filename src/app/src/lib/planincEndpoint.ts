
export function getPlanIncEndpoint(path: string = ''): string {
    try {
        const planincEndpoint = window.localStorage.getItem('planincEndpoint')
        const isTauri = !!(window as any).__TAURI__;
        if (isTauri && planincEndpoint) {
            try {
                const url = new URL(path, planincEndpoint.replace(/"/g, ''));
                return url.toString();
            } catch (error) {
                console.error(error);
                return new URL(path, window.location.origin).toString();
            }
        }

        return new URL(path, window.location.origin).toString();
    } catch (error) {
        console.error(error);
        return new URL(path, window.location.origin).toString();
    }
}

export function isTauriAndEndpointUndefined(): boolean {
    const isTauri = !!(window as any).__TAURI__;
    const planincEndpoint = window.localStorage.getItem('planincEndpoint')
    return isTauri && !planincEndpoint;
}

export function savePlanIncEndpoint(endpoint: string): void {
    if (endpoint) {
        window.localStorage.setItem('planincEndpoint', endpoint);
    }
}

export function getSavedEndpoint(): string {
    return window.localStorage.getItem('planincEndpoint') || '';
}
