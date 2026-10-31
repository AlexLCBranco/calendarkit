// Segmented control (League | Team, List | Calendar, 1 week | 2 weeks).

export function Segmented<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`ck-tabs${className}`} role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={`ck-tab${value === v ? ' ck-tab-selected' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
