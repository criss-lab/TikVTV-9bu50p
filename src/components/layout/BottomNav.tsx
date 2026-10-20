import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Compass, Bookmark, Clock, Flame, Film, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWatchHistory } from '@/hooks/useWatchHistory';

const tabs = [
  { id: 'home',     path: '/',          icon: Home,     label: 'Home' },
  { id: 'search',   path: '/search',    icon: Search,   label: 'Search' },
  { id: 'explore',  path: '/explore',   icon: Compass,  label: 'Explore', ai: true },
  { id: 'trending', path: '/trending',  icon: Flame,    label: 'Hot' },
  { id: 'clips',    path: '/clips',     icon: Film,     label: 'Clips' },
  { id: 'epg',      path: '/epg',       icon: Calendar, label: 'Guide' },
  { id: 'profile',  path: '/profile',   icon: User,     label: 'Profile' },
];

export default function BottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { history } = useWatchHistory();

  // Only show 5 most relevant tabs based on available space
  const visibleTabs = tabs.slice(0, 7);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-x-0 border-b-0 shadow-[0_-12px_36px_rgba(0,0,0,0.35)]">
      {/* AI suggestion strip - shown when history exists on home */}
      {history.length > 3 && location.pathname === '/' && (
        <AiSuggestionStrip />
      )}

      <div className="flex items-center justify-around px-0.5 pb-safe">
        {visibleTabs.map(tab => {
          const Icon      = tab.icon;
          const isActive  = location.pathname === tab.path ||
            (tab.path !== '/' && location.pathname.startsWith(tab.path));

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-xl transition-all duration-200 flex-1',
                isActive ? 'text-white' : 'opacity-65 hover:opacity-100'
              )}
            >
              {/* Active background glow */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-primary/5 rounded-xl border border-primary/25" />
              )}

              {/* AI badge on Explore */}
              {tab.ai && (
                <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold bg-gradient-to-r from-primary to-secondary text-white px-1 py-0.5 rounded-full leading-none z-10">
                  AI
                </span>
              )}

              <div className="relative">
                <Icon
                  className={cn(
                    'w-[18px] h-[18px] transition-colors',
                    isActive
                      ? 'text-primary drop-shadow-[0_0_6px_rgba(254,44,85,0.6)]'
                      : 'text-white/70'
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </div>

              <span
                className={cn(
                  'text-[9px] font-medium transition-colors leading-none',
                  isActive ? 'text-primary' : 'text-white/45'
                )}
              >
                {tab.label}
              </span>

              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AiSuggestionStrip() {
  const { getSuggestedCategories } = useWatchHistory();
  const navigate = useNavigate();
  const suggested = getSuggestedCategories(4);
  if (suggested.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1 border-b border-white/5">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-white/30 font-medium flex-shrink-0 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-secondary inline-block" />
          AI picks:
        </span>
        {suggested.map(cat => (
          <button
            key={cat}
            onClick={() => navigate(`/?cat=${cat}`)}
            className="flex-shrink-0 text-[10px] font-semibold text-white/70 bg-white/8 hover:bg-primary/20 hover:text-primary border border-white/10 px-2.5 py-1 rounded-full transition-colors capitalize"
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}
