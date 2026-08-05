// Branded 404. Everything reachable is on the console navigation; a bad URL
// should route the visitor back rather than dead-end them.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
      <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
        <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
          Comprehensive Compliance Solutions
        </p>
        <h1 className="font-heading font-bold text-xl mb-3">Page not found</h1>
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          Nothing lives at this address. Every console surface is reachable from the overview.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover"
          >
            Back to the overview
          </Link>
        </div>
        <div className="mt-6 h-[2px] w-full bg-accent" />
      </div>
    </main>
  );
}
