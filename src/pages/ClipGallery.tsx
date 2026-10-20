import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Clock, Trash2, Loader2, Film, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getChannelById, fetchAllChannels } from '@/lib/iptvApi';
import { cn, getCountryFlag, timeAgo } from '@/lib/utils';
import type { IPTVChannel } from '@/types';
import { toast } from 'sonner';

interface ClipRow {
  id: string;
  channel_id: string;
  storage_path: string;
  public_url: string;
  duration_secs: number;
  recorded_by: string | null;
  expires_at: string;
  created_at: string;
  channel?: IPTVChannel;
}

export default function ClipGallery() {
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const [clips,     setClips]   = useState<ClipRow[]>([]);
  const [loading,   setLoading] = useState(true);
  const [playing,   setPlaying] = useState<string | null>(null);
  const [deleting,  setDeleting] = useState<string | null>(null);
  const videoRefs   = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    loadClips();
    // Clips are independent of IPTV streams, but must never continue audio/network work off-page.
    const pauseAll = () => {
      Object.values(videoRefs.current).forEach(el => el?.pause());
      setPlaying(null);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseAll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', pauseAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', pauseAll);
      Object.values(videoRefs.current).forEach(el => {
        if (!el) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
      videoRefs.current = {};
    };
  }, []);

  async function loadClips() {
    setLoading(true);
    const { data, error } = await supabase
      .from('channel_clips')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) { console.error(error); setLoading(false); return; }

    // Ensure channels are loaded
    await fetchAllChannels();

    const enriched = (data || []).map(clip => ({
      ...clip,
      channel: getChannelById(clip.channel_id) ?? undefined,
    }));

    setClips(enriched);
    setLoading(false);
  }

  async function deleteClip(clip: ClipRow) {
    if (!user || clip.recorded_by !== user.id) { toast.error('Not your clip'); return; }
    setDeleting(clip.id);

    // Delete from storage
    await supabase.storage.from('channel-clips').remove([clip.storage_path]);
    // Delete from DB
    const { error } = await supabase.from('channel_clips').delete().eq('id', clip.id);
    if (error) { toast.error('Delete failed'); } else {
      setClips(prev => prev.filter(c => c.id !== clip.id));
      toast.success('Clip deleted');
    }
    setDeleting(null);
  }

  function handlePlay(clipId: string) {
    // Pause all others first
    Object.entries(videoRefs.current).forEach(([id, el]) => {
      if (id !== clipId && el) { el.pause(); el.currentTime = 0; }
    });
    const el = videoRefs.current[clipId];
    if (!el) return;
    if (playing === clipId) { el.pause(); setPlaying(null); }
    else {
      el.play().then(() => setPlaying(clipId)).catch(() => {
        setPlaying(null);
        toast.error('Could not play this clip. Try again.');
      });
    }
  }

  function expiresIn(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms < 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    if (h < 1) return 'Expires soon';
    return `Expires in ${h}h`;
  }

  if (loading) return (
    <div className="h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-12 pb-4 bg-black/95 backdrop-blur border-b border-white/8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">Clip Gallery</h1>
            <p className="text-white/40 text-xs">{clips.length} clips · auto-expire after 24h</p>
          </div>
          <Film className="w-5 h-5 text-primary ml-auto" />
        </div>
      </div>

      {/* Clips grid */}
      {clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Film className="w-16 h-16 text-white/10" />
          <p className="text-white/30 text-sm text-center px-8">
            No clips yet. Clips are recorded automatically as users watch channels.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-semibold"
          >
            Watch Live TV
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 pt-4">
          {clips.map(clip => {
            const ch = clip.channel;
            const isPlaying = playing === clip.id;
            const isOwn = user?.id === clip.recorded_by;

            return (
              <div key={clip.id} className="relative rounded-2xl overflow-hidden bg-gray-900 border border-white/8 group">
                {/* Video */}
                <div className="relative aspect-[9/16] bg-black">
                  <video
                    ref={el => { videoRefs.current[clip.id] = el; }}
                    src={clip.public_url}
                    className="w-full h-full object-contain bg-black"
                    playsInline
                    loop
                    muted
                    preload="none"
                    onPlay={() => setPlaying(clip.id)}
                    onPause={() => setPlaying(current => current === clip.id ? null : current)}
                    onEnded={() => setPlaying(null)}
                  />

                  {/* Play overlay */}
                  <button
                    onClick={() => handlePlay(clip.id)}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-opacity',
                      isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
                    )}
                  >
                    <div className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center transition-all',
                      'bg-black/50 backdrop-blur border border-white/20 group-hover:scale-110'
                    )}>
                      <Play className={cn('w-5 h-5', isPlaying ? 'text-white/0' : 'text-white')} fill={isPlaying ? 'transparent' : 'white'} />
                    </div>
                  </button>

                  {/* Gradient */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

                  {/* Duration badge */}
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {clip.duration_secs}s
                  </div>

                  {/* Channel info */}
                  <div className="absolute bottom-2 left-2 right-2">
                    {ch && (
                      <div className="flex items-center gap-1.5">
                        {ch.logo && (
                          <img src={ch.logo} alt={ch.name} className="w-5 h-5 rounded object-contain bg-white/10 flex-none" />
                        )}
                        <p className="text-white text-[11px] font-semibold truncate">{ch.name}</p>
                        <span className="text-white/50 text-[10px] flex-none">{getCountryFlag(ch.countryCode)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-2 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-white/30 text-[10px]">
                      <Clock className="w-3 h-3 flex-none" />
                      <span className="truncate">{expiresIn(clip.expires_at)}</span>
                    </div>
                    <p className="text-white/20 text-[9px] mt-0.5">{timeAgo(clip.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-1 flex-none">
                    <a
                      href={clip.public_url}
                      download
                      onClick={e => e.stopPropagation()}
                      className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-white/50" />
                    </a>
                    {isOwn && (
                      <button
                        onClick={() => deleteClip(clip)}
                        disabled={deleting === clip.id}
                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        {deleting === clip.id
                          ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                          : <Trash2 className="w-3 h-3 text-red-400" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
