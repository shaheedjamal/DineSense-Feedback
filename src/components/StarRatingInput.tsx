import { Star } from 'lucide-react';

interface StarRatingInputProps {
  label: string;
  description?: string;
  value: number;
  onChange: (rating: number) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Expectations',
  3: 'Acceptable',
  4: 'Good',
  5: 'Excellent',
};

export default function StarRatingInput({ label, description, value, onChange }: StarRatingInputProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 border-b border-slate-200 last:border-b-0">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= value;
            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={value === star}
                aria-label={`${star} out of 5 stars`}
                onClick={() => onChange(star)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-900"
              >
                <Star
                  className={`h-6 w-6 transition-colors ${
                    active ? 'fill-amber-500 text-amber-500' : 'text-slate-300'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <span className="w-28 text-right text-xs font-medium text-slate-600 tabular-nums">
          {value > 0 ? `${value}/5 · ${RATING_LABELS[value]}` : 'Select rating'}
        </span>
      </div>
    </div>
  );
}
