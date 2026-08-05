"use client";

// Route-level error boundary. Fail-closed language, no stack traces or internals
// in the body (the digest is a safe correlation handle for server logs). Without
// this an unexpected render/query error falls through to Next's default page.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
      <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
        <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
          Comprehensive Compliance Solutions
        </p>
        <h1 className="font-heading font-bold text-xl mb-3">Something failed — nothing proceeded</h1>
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          The console fails closed: the page stopped rather than showing or writing anything
          uncertain. No register was modified by this failure. Retry, and if it persists contact
          the platform operator{error.digest ? ` quoting reference ${error.digest}` : ""}.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover"
          >
            Retry
          </button>
          <a
            href="/"
            className="px-4 py-2 text-sm font-semibold text-accent border border-accent hover:bg-accent hover:text-white"
          >
            Back to the overview
          </a>
        </div>
        <div className="mt-6 h-[2px] w-full bg-status-danger" />
      </div>
    </main>
  );
}
