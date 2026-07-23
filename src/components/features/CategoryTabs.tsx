import { useRef } from 'react';
import { CATEGORIES } from '@/constants/categories';
import { cn } from '@/lib/utils';

interface Props {
  activeCategory:   string;
  onCategoryChange: (id: string) => void;
}

export default function CategoryTabs({ activeCategory, onCategoryChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClick = (id: string) => {
    onCategoryChange(id);
    // Scroll active tab into view
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-cat="${id}"]`) as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  return (
    <div className="relative bg-black/80 backdrop-blur-sm border-b border-white/5">
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto px-3 py-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              data-cat={cat.id}
              onClick={() => handleClick(cat.id)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                'min-h-[36px] min-w-[44px]',
                isActive
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
              )}
            >
              <span className="text-base leading-none">{cat.emoji}</span>
              <span className="hidden sm:block">{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
