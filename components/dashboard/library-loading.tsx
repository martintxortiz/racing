export default function LibraryLoading() {
  return (
    <div
      role="status"
      aria-label="Loading library"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px] border border-border/60 bg-card"
    >
      <div className="h-10 border-b border-border/60 bg-muted/40" />
      <div className="h-10 border-b border-border/60 bg-muted/60" />
      <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-auto">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex h-12 items-center px-3">
            <div className="h-3 w-1/3 animate-pulse rounded-[2px] bg-foreground/5" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading library data…</span>
    </div>
  );
}
