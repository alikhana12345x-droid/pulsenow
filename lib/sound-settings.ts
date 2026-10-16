const LS_KEY = "bp_sound";
const CHANGE_EVENT = "bp:sound";

export interface SoundSettings {
    sfx: number;        // 0–1, covers button clicks + action SFX
    bgMusic: number;    // 0–1, covers ambient loops
    vibration: boolean; // haptic feedback on win/loss
}

const DEFAULTS: SoundSettings = { sfx: 0.55, bgMusic: 0.25, vibration: true };

export function getSoundSettings(): SoundSettings {
    if (typeof window === "undefined") return DEFAULTS;
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return DEFAULTS;
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        return DEFAULTS;
    }
}

export function setSoundSettings(patch: Partial<SoundSettings>): SoundSettings {
    const next: SoundSettings = { ...getSoundSettings(), ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
    return next;
}

export function onSoundSettingsChange(cb: (s: SoundSettings) => void): () => void {
    const handler = (e: Event) => cb((e as CustomEvent<SoundSettings>).detail);
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
}
