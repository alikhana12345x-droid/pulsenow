import confetti from "canvas-confetti";

const WIN_COLORS = ["#f29a0b", "#5eead4", "#ffffff", "#fbbf24", "#a78bfa"];
const CASHOUT_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#ffffff"];

export function fireWinConfetti() {
  confetti({
    particleCount: 110,
    spread: 65,
    origin: { y: 0.65 },
    colors: WIN_COLORS,
    ticks: 220,
    scalar: 1.1,
  });
  setTimeout(() => {
    confetti({
      particleCount: 55,
      spread: 85,
      origin: { y: 0.6 },
      colors: WIN_COLORS,
      startVelocity: 22,
      ticks: 160,
    });
  }, 130);
}

export function fireCashoutConfetti() {
  confetti({
    particleCount: 70,
    spread: 55,
    origin: { y: 0.65 },
    colors: CASHOUT_COLORS,
    ticks: 190,
    scalar: 1.05,
  });
}
