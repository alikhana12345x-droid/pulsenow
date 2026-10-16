import { getSoundSettings } from "./sound-settings";

let _click: HTMLAudioElement | null = null;

export function playClick() {
    if (typeof window === "undefined") return;
    if (!_click) _click = new Audio("/sounds/button-click.mp3");
    _click.volume = getSoundSettings().sfx;
    _click.currentTime = 0;
    _click.play().catch(() => {});
}
