import { Moon, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SLEEP_OPTIONS, type SleepTimerOption } from '@/hooks/useSleepTimer';
import type { SleepTimerState } from '@/types';

interface Props {
  timerState:     SleepTimerState;
  remaining:      number;
  formatRemaining: () => string;
  onStart:        (m: SleepTimerOption) => void;
  onCancel:       () => void;
  onClose:        () => void;
}

export default function SleepTimerOverlay({
  timerState, remaining, formatRemaining, onStart, onCancel, onClose,
}: Props) {
  const pct = timerState.active && timerState.endsAt
    ? Math.max(0, (timerState.endsAt - Date.now()) / (timerState.minutes * 60_000))
    : 0;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-card border border-white/10 rounded-t-3xl p-6 pb-10 slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-primary" />
            <h3 className="text-foreground font-bold text-lg">Sleep Timer</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-foreground/60" />
          </button>
        </div>

        {/* Active timer display */}
        {timerState.active && (
          <div className="mb-6 flex flex-col items-center gap-3">
            {/* Circular progress */}
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r="40" fill="none"
                  stroke="hsl(var(--primary))" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct)}`}
                  style={{ transition: 'stroke-dashoffset 0.5s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Clock className="w-4 h-4 text-primary mb-0.5" />
                <span className="text-foreground font-bold text-lg leading-none">{formatRemaining()}</span>
              </div>
            </div>
            <p className="text-foreground/50 text-sm">Auto-pause in {formatRemaining()}</p>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 text-red-400 text-sm font-semibold bg-red-400/10 px-4 py-2 rounded-full hover:bg-red-400/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel timer
            </button>
          </div>
        )}

        {/* Timer options */}
        {!timerState.active && (
          <>
            <p className="text-foreground/50 text-sm mb-4">Pause playback after:</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {SLEEP_OPTIONS.map(mins => (
                <button
                  key={mins}
                  onClick={() => { onStart(mins); onClose(); }}
                  className={cn(
                    'py-3 rounded-2xl text-sm font-semibold transition-all duration-200',
                    'border border-white/10 bg-white/5 hover:bg-primary/20 hover:border-primary/40 hover:text-primary text-foreground/80',
                    'active:scale-95'
                  )}
                >
                  {mins < 60 ? `${mins} min` : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="text-foreground/30 text-[11px] text-center">
          Tap anywhere outside to dismiss
        </p>
      </div>
    </div>
  );
}
