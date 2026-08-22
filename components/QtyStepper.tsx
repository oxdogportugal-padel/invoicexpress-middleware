"use client";

export default function QtyStepper({
  qty,
  onChange,
  min = 1,
  max,
  disabled = false,
}: {
  qty: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  function clamp(n: number) {
    let v = n;
    if (v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || qty <= min}
        onClick={() => onChange(clamp(qty - 1))}
        className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-gray-700 disabled:opacity-30"
      >
        &minus;
      </button>
      <span className="w-8 text-center text-sm font-medium text-gray-900">{qty}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || (max !== undefined && qty >= max)}
        onClick={() => onChange(clamp(qty + 1))}
        className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-gray-700 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
