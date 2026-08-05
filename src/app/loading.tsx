// Route-level loading state. Server components load registers under RLS before
// rendering; without this a slow query is a blank white page. Skeleton blocks,
// no spinners — consistent with the console's flat panel language.
export default function Loading() {
  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="animate-pulse space-y-4 max-w-5xl mx-auto">
        <div className="h-6 w-64 bg-panel border border-border" />
        <div className="h-3 w-96 bg-panel border border-border" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-panel border border-border" />
          ))}
        </div>
        <div className="h-48 bg-panel border border-border mt-4" />
      </div>
    </main>
  );
}
