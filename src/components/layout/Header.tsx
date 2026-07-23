import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Search, Globe, LogIn, LogOut, Settings, ChevronDown, Tv } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useNotifications } from '@/hooks/useNotifications';
import { useLangStore } from '@/stores/langStore';
import { useT, LANGUAGE_OPTIONS } from '@/lib/i18n';
import { formatCount, cn } from '@/lib/utils';
import AuthModal from '@/components/features/AuthModal';
import type { Language } from '@/types';

interface Props {
  liveCount:     number;
  totalChannels: number;
}

export default function Header({ liveCount, totalChannels }: Props) {
  const { user, logout }         = useAuthStore();
  const navigate                 = useNavigate();
  const t                        = useT();
  const { lang, setLang }        = useLangStore();
  const { notifications, unread, markAllRead, clearAll } = useNotifications(user);

  const [showAuth,   setShowAuth]   = useState(false);
  const [showNotif,  setShowNotif]  = useState(false);
  const [showLang,   setShowLang]   = useState(false);
  const [showUser,   setShowUser]   = useState(false);

  const handleLogout = () => {
    logout();
    setShowUser(false);
  };

  return (
    <>
      <header className="relative z-30 flex items-center justify-between px-4 py-2.5 bg-black/90 backdrop-blur-xl border-b border-white/8">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary via-red-500 to-secondary flex items-center justify-center shadow-lg">
            <Tv className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-black text-lg tracking-tight leading-none">
            Tik<span className="text-primary">V</span>TV
          </span>
        </button>

        {/* Live badge + channel count */}
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1">
          {liveCount > 0 && (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot flex-shrink-0" />
              <span className="text-green-400 text-[11px] font-bold">{liveCount}</span>
              <span className="text-white/30 text-[11px]">live</span>
              <span className="text-white/10 text-[11px] mx-0.5">·</span>
            </>
          )}
          <span className="text-white/50 text-[11px]">{formatCount(totalChannels)} ch</span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <IconBtn onClick={() => navigate('/search')} label="Search">
            <Search className="w-4.5 h-4.5 text-white/70" />
          </IconBtn>

          {/* Notification bell */}
          <div className="relative">
            <IconBtn
              onClick={() => { setShowNotif(v => !v); setShowLang(false); setShowUser(false); }}
              label="Notifications"
            >
              <div className="relative">
                <Bell className="w-4.5 h-4.5 text-white/70" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-primary text-white w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
            </IconBtn>

            {showNotif && (
              <NotifPanel
                notifications={notifications}
                unread={unread}
                onMarkRead={markAllRead}
                onClear={clearAll}
                onClose={() => setShowNotif(false)}
                onNavigate={(id) => { navigate(`/channel/${id}`); setShowNotif(false); }}
              />
            )}
          </div>

          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => { setShowLang(v => !v); setShowNotif(false); setShowUser(false); }}
              className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <span className="text-white/70 text-[11px] font-semibold uppercase">{lang}</span>
              <ChevronDown className="w-3 h-3 text-white/40" />
            </button>

            {showLang && (
              <div className="absolute right-0 top-full mt-1 bg-black/95 backdrop-blur-xl border border-white/15 rounded-xl overflow-hidden min-w-[130px] z-50 shadow-xl">
                {LANGUAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.code}
                    onClick={() => { setLang(opt.code as Language); setShowLang(false); }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors',
                      lang === opt.code ? 'text-primary bg-primary/10 font-semibold' : 'text-white/70 hover:bg-white/5'
                    )}
                  >
                    <span>{opt.native}</span>
                    {lang === opt.code && <span className="text-primary text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User / auth */}
          <div className="relative">
            {user ? (
              <>
                <button
                  onClick={() => { setShowUser(v => !v); setShowNotif(false); setShowLang(false); }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold border border-white/20"
                >
                  {user.username.charAt(0).toUpperCase()}
                </button>

                {showUser && (
                  <div className="absolute right-0 top-full mt-1 bg-black/95 backdrop-blur-xl border border-white/15 rounded-xl overflow-hidden min-w-[160px] z-50 shadow-xl">
                    <div className="px-3 py-2.5 border-b border-white/10">
                      <p className="text-white font-semibold text-sm truncate">@{user.username}</p>
                      <p className="text-white/30 text-[11px] truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { navigate('/favorites'); setShowUser(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 transition-colors"
                    >
                      <Globe className="w-4 h-4" /> My Favorites
                    </button>
                    <button
                      onClick={() => { navigate('/history'); setShowUser(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 transition-colors"
                    >
                      <Settings className="w-4 h-4" /> Watch History
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> {t('logout')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 bg-primary/90 hover:bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('login')}
              </button>
            )}
          </div>
        </div>
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}

function NotifPanel({
  notifications, unread, onMarkRead, onClear, onClose, onNavigate,
}: {
  notifications: ReturnType<typeof useNotifications>['notifications'];
  unread: number; onMarkRead: () => void; onClear: () => void;
  onClose: () => void; onNavigate: (id: string) => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 bg-black/95 backdrop-blur-xl border border-white/15 rounded-xl overflow-hidden w-72 z-50 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-white/60" />
          <span className="text-white font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <span className="text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={onMarkRead} className="text-[10px] text-primary hover:underline">Mark read</button>
          )}
          {notifications.length > 0 && (
            <button onClick={onClear} className="text-[10px] text-white/30 hover:text-white/60 ml-2">Clear</button>
          )}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <BellOff className="w-8 h-8 text-white/20" />
            <p className="text-white/30 text-sm">No notifications yet</p>
            <p className="text-white/20 text-xs">Save channels to get notified</p>
          </div>
        ) : (
          notifications.slice(0, 20).map(n => (
            <button
              key={n.id}
              onClick={() => onNavigate(n.channelId)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0',
                !n.readAt && 'bg-primary/5'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                n.type === 'reaction' ? 'bg-primary/20' : 'bg-secondary/20'
              )}>
                {n.type === 'reaction' ? '❤️' : '💬'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs leading-snug">
                  <span className="font-semibold">{n.count} new {n.type === 'reaction' ? 'reaction' : 'comment'}{n.count > 1 ? 's' : ''}</span>
                  {' '}on a saved channel
                </p>
                {!n.readAt && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
