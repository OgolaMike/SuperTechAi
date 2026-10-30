export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-orb-a rounded-full bg-accent/20 blur-[120px]" />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] animate-orb-b rounded-full bg-up/15 blur-[140px]" />
      <div className="absolute bottom-[-10rem] left-1/3 h-[26rem] w-[26rem] animate-orb-a rounded-full bg-accent/10 blur-[130px]" />
      <div className="absolute bottom-1/4 right-1/4 h-64 w-64 animate-orb-b rounded-full bg-warn/10 blur-[110px]" />

      <div
        className="absolute inset-0 animate-grid-pan opacity-[0.07] dark:opacity-[0.09]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--accent)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent)) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)',
        }}
      />

      <div className="absolute inset-x-0 top-0 h-40 animate-scan-sweep bg-gradient-to-b from-transparent via-accent/[0.06] to-transparent" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(var(--canvas))_100%)] opacity-80" />
    </div>
  );
}
