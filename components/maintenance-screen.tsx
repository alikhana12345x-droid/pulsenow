export function MaintenanceScreen() {
  return (
    <div className="fixed inset-0 z-50 flex h-screen items-center justify-center bg-bp-bg">
      <div className="flex flex-col items-center gap-6">
        <img
          src="/brand/logo-icon.png"
          alt="PulseNow"
          className="h-16 w-auto animate-pulse"
        />
        <div className="flex gap-2">
          <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "#f29a0b" }} />
          <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "#2dd4bf" }} />
          <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "#f29a0b", opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}
