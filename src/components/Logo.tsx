const SIZES = { sm: "h-12 w-32", md: "h-16 w-44", lg: "h-24 w-64" } as const;

export function LogoFull({ size = "md", light = false }: { size?: keyof typeof SIZES; light?: boolean }) {
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${SIZES[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="DMS Tech" width={600} height={338} className={`absolute left-0 top-1/2 h-auto w-full -translate-y-1/2 object-contain ${light ? "drop-shadow-sm" : ""}`} />
    </span>
  );
}

export function LogoMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const box = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-16 w-16" }[size];
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="DMS Tech" width={64} height={64} className={`${box} shrink-0 object-contain ${className}`} />;
}
