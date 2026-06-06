// A small CSS spinner. `ring` overrides the border colors so it can sit on
// light backgrounds (default) or a colored button.
export function Spinner({ label, ring }: { label?: string; ring?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span
        className={`h-4 w-4 animate-spin rounded-full border-2 ${ring ?? "border-gray-300 border-t-blue-600"}`}
        aria-hidden="true"
      />
      {label && <span>{label}</span>}
    </span>
  );
}
