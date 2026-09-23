export function Spinner({ size = "md" }) {
  const s = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" }[size];
  return (
    <div className={`${s} animate-spin rounded-full border-2 border-mist border-t-petrol-500`} />
  );
}

export function PageLoader({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-ink/50">{message}</p>
    </div>
  );
}

export function AnalyzingLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <Spinner size="lg" />
      <div className="text-center">
        <p className="text-sm font-medium text-ink/80">Analyzing job description...</p>
        <p className="text-xs text-ink/55 mt-1">AI parsing + H-1B scoring + resume match</p>
      </div>
    </div>
  );
}
