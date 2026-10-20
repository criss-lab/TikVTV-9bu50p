import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, Globe, PictureInPicture2, Loader2, Wifi } from 'lucide-react';
import { fetchAllChannels, getChannelById } from '@/lib/iptvApi';
import { getCountryFlag, categoryColor, cn, formatCount, timeAgo } from '@/lib/utils';
import { useReactions } from '@/hooks/useReactions';
import { useFavorites } from '@/hooks/useFavorites';
import { useComments } from '@/hooks/useComments';
import { useAuthStore } from '@/stores/authStore';
import AuthModal from '@/components/features/AuthModal';
import type { IPTVChannel } from '@/types';
import { toast } from 'sonner';
import { useViewingAccess } from '@/hooks/useViewingAccess';

export default function ChannelDetail() {
  const { id }             = useParams<{ id: string }>();
  const navigate           = useNavigate();
  const { user }           = useAuthStore();
  const [channel, setChannel] = useState<IPTVChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const videoRef           = useRef<HTMLVideoElement>(null);
  const hlsRef             = useRef<unknown>(null);
  const detailCleanupRef   = useRef<(() => void) | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  // Start muted so mobile browsers allow autoplay, matching the working vertical feed.
  const [muted, setMuted]  = useState(true);
  const [pipActive, setPipActive] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const { allowed, active, remainingMs, loading: accessLoading } = useViewingAccess();

  const { liked, likeCount, toggleLike }     = useReactions(id || '', user?.id);
  const { isFavorite, toggleFavorite }       = useFavorites(user?.id);
  const { comments, count, fetchComments, addComment } = useComments(id || '');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setChannel(null);
    let cancelled = false;
    fetchAllChannels()
      .then(() => { if (!cancelled) setChannel(getChannelById(id) || null); })
      .catch(() => { if (!cancelled) toast.error('Unable to load channel information'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (channel) fetchComments();
    if (channel && allowed && !accessLoading) void initVideo(channel.streamUrl);
    return () => destroyHls();
  }, [channel, retryKey, allowed, accessLoading]);

  const initVideo = async (src: string) => {
    const video = videoRef.current;
    if (!video || !src) return;
    setVideoReady(false);
    setVideoError(false);
    let disposed = false;
    let retries = 0;
    const fail = () => {
      if (disposed) return;
      setVideoError(true);
      setVideoReady(false);
      video.pause();
    };
    const ready = () => {
      if (disposed) return;
      window.clearTimeout(startupTimer);
      setVideoReady(true);
      video.play().catch(() => {});
    };
    const startupTimer = window.setTimeout(fail, 18000);
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', fail, { once: true });
    detailCleanupRef.current = () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', fail);
    };
    try {
      const { default: Hls } = await import('hls.js');
      if (disposed) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 20,
          maxMaxBufferLength: 35,
          startLevel: -1,
          abrEwmaDefaultEstimate: 1000000,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (retries++ < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (retries <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else fail();
        });
        hls.attachMedia(video);
        hls.loadSource(src);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.load();
      } else fail();
    } catch { fail(); }

  };

  const destroyHls = () => {
    detailCleanupRef.current?.();
    detailCleanupRef.current = null;
    if (hlsRef.current) {
      (hlsRef.current as { destroy: () => void }).destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  };

  const handlePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      setPipActive(false);
    } else {
      await video.requestPictureInPicture().catch(() => toast.error('PiP not supported'));
      setPipActive(true);
    }
  };

  const handleShare = async () => {
    const text = `Watching ${channel?.name} live on TikVTV!`;
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: channel?.name, text, url }).catch(() => {});
    else { try { await navigator.clipboard.writeText(url); toast.success('Channel link copied!'); } catch { toast.error('Unable to copy link'); } }
  };

  const handleLike = async () => {
    if (!user) { setShowAuth(true); return; }
    await toggleLike();
  };

  const handleFav = async () => {
    if (!user) { setShowAuth(true); return; }
    if (channel) await toggleFavorite(channel);
  };

  const handleSendComment = async () => {
    if (!user) { setShowAuth(true); return; }
    if (!commentText.trim() || sending) return;
    setSending(true);
    try {
      await addComment(commentText, user.id);
      setCommentText('');
    } catch { toast.error('Could not send comment'); }
    finally { setSending(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
    </div>
  );

  if (!channel) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <Wifi className="w-12 h-12 text-white/20" />
      <p className="text-white/40">Channel not found</p>
      <button onClick={() => navigate(-1)} className="text-primary text-sm">← Go back</button>
    </div>
  );

  const flag = getCountryFlag(channel.countryCode);
  const faved = isFavorite(channel.id);

  return (
    <div className="min-h-screen bg-black">
      {/* Back button */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="pointer-events-auto w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-white font-semibold text-sm truncate pointer-events-auto max-w-[60vw]">{channel.name}</h1>
      </div>

      {/* Video */}
      <div
        className="relative bg-black cursor-pointer"
        style={{ height: '56vw', maxHeight: 380, minHeight: 200 }}
        onClick={() => setMuted(m => !m)}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted={muted}
          playsInline
          controls
        />
        {!accessLoading && !allowed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
            <h2 className="text-xl font-bold">Channel Locked</h2>
            <p className="text-sm text-white/70">15-minute free preview ended</p>
            <button type="button" className="rounded-xl bg-primary px-5 py-3 font-bold" onClick={e => { e.stopPropagation(); navigate('/premium'); }}>Unlock Premium</button>
          </div>
        )}
        {!videoReady && !videoError && allowed && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
            {channel.logo ? (
              <img src={channel.logo} alt={channel.name} className="w-24 h-24 object-contain opacity-40" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-white text-4xl font-bold">{channel.name.charAt(0)}</span>
              </div>
            )}
            <div className="absolute w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {videoError && allowed && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="flex flex-col items-center gap-2">
              <Wifi className="w-10 h-10 text-white/20" />
              <p className="text-white/40 text-sm">Stream unavailable</p>
              <button type="button" onClick={() => setRetryKey(key => key + 1)} className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Retry stream</button>
            </div>
          </div>
        )}
        {videoReady && allowed && (
          <div className="absolute top-12 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
            <div className="w-1.5 h-1.5 bg-white rounded-full live-dot" />
            LIVE
          </div>
        )}
        {/* PiP button */}
        {videoReady && allowed && 'pictureInPictureEnabled' in document && (
          <button
            onClick={e => { e.stopPropagation(); handlePiP(); }}
            className={cn(
              'absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
              pipActive ? 'bg-primary' : 'bg-black/50 backdrop-blur hover:bg-black/70'
            )}
          >
            <PictureInPicture2 className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {!accessLoading && !active && allowed && <div className="bg-black px-4 py-2 text-center text-xs font-semibold text-white/80">Free preview remaining: {String(Math.floor(remainingMs / 60000)).padStart(2, '0')}:{String(Math.floor(remainingMs % 60000 / 1000)).padStart(2, '0')}</div>}
      {/* Channel info + actions */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {channel.logo && (
                <img src={channel.logo} alt={channel.name} className="w-8 h-8 rounded-lg object-contain bg-white/10 p-0.5" />
              )}
              <h2 className="text-white font-bold text-xl leading-tight truncate">{channel.name}</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">{flag}</span>
              <span className="text-white/60 text-sm">{channel.country || 'Global'}</span>
              {channel.languages[0] && <span className="text-white/40 text-xs uppercase">· {channel.languages[0]}</span>}
              {channel.network && (
                <span className="flex items-center gap-1 text-white/30 text-xs"><Globe className="w-3 h-3" />{channel.network}</span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-2">
              {channel.categories.map(c => (
                <span key={c} className={cn('text-white text-[11px] font-semibold px-2 py-0.5 rounded-full', categoryColor(c))}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ActionBtn active={liked} activeClass="bg-primary/30 border-primary/50" onClick={handleLike} label={formatCount(likeCount)}>
              <Heart className={cn('w-5 h-5', liked ? 'text-primary fill-primary' : 'text-white')} />
            </ActionBtn>
            <ActionBtn active={faved} activeClass="bg-yellow-500/30 border-yellow-500/50" onClick={handleFav} label="Save">
              <Bookmark className={cn('w-5 h-5', faved ? 'text-yellow-400 fill-yellow-400' : 'text-white')} />
            </ActionBtn>
            <ActionBtn onClick={handleShare} label="Share">
              <Share2 className="w-5 h-5 text-white" />
            </ActionBtn>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-white/60" />
          <h3 className="text-white font-semibold">{formatCount(count)} Comments</h3>
        </div>

        {/* Input */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex-shrink-0 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{(user?.username || '?').charAt(0).toUpperCase()}</span>
          </div>
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendComment()}
            placeholder={user ? 'Add a comment…' : 'Login to comment…'}
            className="flex-1 bg-white/10 text-white placeholder-white/30 text-sm rounded-full px-4 py-2.5 outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={handleSendComment}
            disabled={!commentText.trim() || sending}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 active:scale-95 transition-all"
          >
            {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <span className="text-white text-sm">↑</span>}
          </button>
        </div>

        {/* Comments list */}
        <div className="space-y-4 pb-10">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex-shrink-0 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {(c.user_profiles?.username || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-white text-xs font-semibold">@{c.user_profiles?.username || 'user'}</span>
                  <span className="text-white/30 text-[11px]">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-white/80 text-sm mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-white/20 text-sm text-center py-6">No comments yet — be first!</p>
          )}
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

function ActionBtn({
  children, label, active, activeClass, onClick
}: {
  children: React.ReactNode;
  label?: string;
  active?: boolean;
  activeClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5',
        'w-12 h-14 rounded-xl border border-white/10 flex items-center justify-center',
        'bg-white/5 hover:bg-white/10 active:scale-95 transition-all',
        active && activeClass
      )}
    >
      {children}
      {label && <span className="text-white/60 text-[10px] font-medium mt-0.5">{label}</span>}
    </button>
  );
}
