import { getSoundSettings } from "./sound-settings";

const v = typeof navigator !== "undefined" ? navigator.vibrate?.bind(navigator) : null;
const vibOn = () => getSoundSettings().vibration;

export const hapticTap = () => v?.(25);
export const hapticWin = () => { if (vibOn()) v?.([60, 30, 120]); };
export const hapticLoss = () => { if (vibOn()) v?.(220); };
export const hapticCashout = () => { if (vibOn()) v?.([40, 20, 80]); };
