// public/src/assets/useVersionPoll.js
// Near-real-time version polling hook (vanilla ESM).
// Polls the version endpoint at the configured interval (default 12s)
// and invokes onChange only when any scope timestamp changes.

/**
 * Hook to poll a version endpoint for timestamp changes.
 *
 * @param {Object} options
 * @param {string} options.url - The URL to poll (e.g. 'api.php?action=versions')
 * @param {number} [options.interval=12000] - Polling interval in ms (defaults to 12000)
 * @param {function(Object): void} options.onChange - Callback fired with new snapshot when timestamps change
 * @returns {{ stop: function(): void }}
 */
export function useVersionPoll({ url, interval = 12000, onChange }) {
    let lastSnapshot = null;
    let timerId = null;
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const json = await res.json();
            if (!json || !json.success || !json.data) return;

            const current = json.data;

            if (lastSnapshot === null) {
                // First call establishes baseline silently without firing onChange.
                lastSnapshot = current;
                return;
            }

            // Check if any timestamp in snapshot has moved
            let hasChanged = false;
            for (const key of Object.keys(current)) {
                if (current[key] !== lastSnapshot[key]) {
                    hasChanged = true;
                    break;
                }
            }

            if (hasChanged) {
                lastSnapshot = current;
                if (typeof onChange === 'function') {
                    onChange(current);
                }
            }
        } catch (e) {
            // Silently ignore network hiccups during background polling
        }
    }

    // Establish baseline immediately
    tick();

    // Schedule recurring poll
    timerId = setInterval(tick, interval);

    return {
        stop() {
            stopped = true;
            if (timerId !== null) {
                clearInterval(timerId);
                timerId = null;
            }
        }
    };
}
