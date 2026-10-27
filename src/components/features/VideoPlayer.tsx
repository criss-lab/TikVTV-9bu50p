
import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Volume2, VolumeX, WifiOff, RefreshCw, PictureInPicture2, Settings2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QualityLevel } from '@/types';

export interface VideoPlayerHandle {
  play:  () => void;
  pause: () => void;
}

interface Props {
  src:           string;
  isActive:      boolean;
  shouldLoad:    boolean;
  channelName:   string;
  channelLogo?:  string;
  onError?:      () => void;
  onReady?:      () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(
  ({ src, isActive, shouldLoad, channelName, channelLogo, onError, onReady }, ref) => {
    const videoRef    = useRef<HTMLVideoElement>(null);
    const hlsRef      = useRef<unknown>(null);
    const timerRef    = useRef<ReturnType<typeof setTimeout>>();
    const stallTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const preloadTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const readyRef    = useRef(false);
    const retryCount  = useRef(0);
    const activeRef = useRef(isActive);
    const metricsRef = useRef({ startedAt: 0, firstFrame: false, stallAt: 0, stalls: 0, stalledMs: 0, failed: false });


    activeRef.current = isActive;
    // Callback identity changes must never tear down an active HLS decoder.
    const onErrorRef = useRef(onError);
    const onReadyRef = useRef(onReady);
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
    const [retryKey, setRetryKey] = useState(0);

    const [muted,       setMuted]       = useState(true);
    const [error,       setError]       = useState(false);
    const [buffering,   setBuffering]   = useState(false);
    const [ready,       setReady]       = useState(false);
    const [pipActive,   setPipActive]   = useState(false);
    const [qualities,   setQualities]   = useState<QualityLevel[]>([]);
    const [currentLvl,  setCurrentLvl]  = useState<number>(-1);
    const [showQuality, setShowQuality] = useState(false);

    const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;

    useImperativeHandle(ref, () => ({
      play:  () => videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
    }));

    // ── HLS init ────────────────────────────────────────────────────────────
    useEffect(() => {
      if (!shouldLoad || !src || !isActive) {
        setReady(false);
        setBuffering(false);
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      setError(false);
      setReady(false);
      setBuffering(true);
      setQualities([]);
      setCurrentLvl(-1);
      readyRef.current = false;

      retryCount.current = 0;
      metricsRef.current = {startedAt: performance.now(), firstFrame: false, stallAt: 0, stalls: 0, stalledMs: 0, failed: false};
      const record = (event: string, durationMs?: number) => {
        // Aggregate only: never collect stream URLs, channel names or viewer identity.
        if (!activeRef.current) return;
        console.info('[Playback metric]', JSON.stringify({event, durationMs: durationMs === undefined ? undefined : Math.round(durationMs), stalls: metricsRef.current.stalls, stalledMs: Math.round(metricsRef.current.stalledMs)}));
      };
      timerRef.current = setTimeout(() => {
        if (!readyRef.current && activeRef.current) {
          markError();
        }
      }, 15_000);

      const markReady = () => {
        if (disposed) return;
        if (readyRef.current) return;
        clearTimeout(timerRef.current);
        readyRef.current = true;
        if (activeRef.current && !metricsRef.current.firstFrame) {
          metricsRef.current.firstFrame = true;
          record('startup', performance.now() - metricsRef.current.startedAt);
        }
        setReady(true);
        setBuffering(false);
        retryCount.current = 0;
        onReadyRef.current?.();
      };

      let disposed = false;
      const markError = () => {
        if (disposed) return;
        clearTimeout(timerRef.current);
        if (activeRef.current && !metricsRef.current.failed) { metricsRef.current.failed = true; record('failed_switch', performance.now() - metricsRef.current.startedAt); }
        setError(true);
        setReady(false);
        setBuffering(false);
        onErrorRef.current?.();
      };

      const destroyHls = () => {
        if (hlsRef.current) {
          (hlsRef.current as { destroy: () => void }).destroy();
          hlsRef.current = null;
        }
      };

      const clearStall = () => { clearTimeout(stallTimerRef.current); };
      const onWaiting = () => {
        if (disposed || !activeRef.current || !readyRef.current) return;
        setBuffering(true);
        if (!metricsRef.current.stallAt) metricsRef.current.stallAt = performance.now();
        clearStall();
        stallTimerRef.current = setTimeout(() => {
          if (disposed || !activeRef.current || video.paused || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
          const hls = hlsRef.current as { nextAutoLevel: number; startLoad: (position?: number) => void } | null;
          if (hls) { hls.nextAutoLevel = 0; hls.startLoad(); }
          else video.play().catch(() => {});
        }, 6000);
      };
      const finishStall = () => {
        if (metricsRef.current.stallAt) {
          const elapsed = performance.now() - metricsRef.current.stallAt;
          metricsRef.current.stallAt = 0;
          if (readyRef.current && activeRef.current) { metricsRef.current.stalls++; metricsRef.current.stalledMs += elapsed; record('rebuffer', elapsed); }
        }
      };
      const onPlaying = () => { clearStall(); finishStall(); markReady(); if (!disposed) setBuffering(false); };
      const requestPlayback = () => {
        if (disposed || !activeRef.current) return;
        // A decoded frame is not proof that playback started; only 'playing' marks ready.
        void video.play().catch(() => { if (!disposed && !video.paused) return; /* timeout retains the skip/retry path */ });
      };
      const onCanPlay = () => { if (!disposed) requestPlayback(); };
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('stalled', onWaiting);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('loadeddata', requestPlayback);

      const init = async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (disposed) return;
          destroyHls();

          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker:           true,
              lowLatencyMode:         false,
              maxBufferLength:        30,
              maxMaxBufferLength:     60,
              maxBufferSize:          48 * 1000 * 1000,
              startLevel:             0,
              capLevelToPlayerSize:  true,
              abrBandWidthFactor:    0.8,
              abrBandWidthUpFactor:  0.7,
              abrEwmaDefaultEstimate: 400_000,
              progressive:            true,
              // Faster segment load retry
              manifestLoadingMaxRetry: 3,
              levelLoadingMaxRetry:    3,
              fragLoadingMaxRetry:     4,
              backBufferLength:       20,
              maxBufferHole:          0.5,
              nudgeMaxRetry:          4,
            });
            hlsRef.current = hls;

            hls.attachMedia(video);
            hls.loadSource(src);

            hls.on(Hls.Events.MANIFEST_PARSED, (_: unknown, data: { levels: {height: number; bitrate: number}[] }) => {
              // Build quality levels list
              const lvls: QualityLevel[] = [
                { level: -1, height: 0, bitrate: 0, label: 'Auto' },
                ...data.levels.map((l, i) => ({
                  level:   i,
                  height:  l.height ? l.height : 0, // Ensure height is number
                  bitrate: l.bitrate ? l.bitrate : 0, // Ensure bitrate is number
                  label:   l.height ? `${l.height}p` : `Level ${i + 1}`,
                })).reverse(),
              ];
              setQualities(lvls);
              // Wait for loadeddata/canplay: a manifest alone is not playable media.
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (_: unknown, data: { level: number }) => {
              setCurrentLvl(data.level);
            });

            hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal: boolean; type: string }) => {
              if (d.fatal) {
                if (retryCount.current < 2 && d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                  retryCount.current++;
                  hls.startLoad();
                } else if (retryCount.current < 2 && d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                  retryCount.current++;
                  hls.recoverMediaError();
                } else {
                  markError();
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            video.onerror = markError;
          } else {
            markError();
          }
        } catch {
          markError();
        }
      };

      init();

      return () => {
        if (activeRef.current && readyRef.current) record('session_end', performance.now() - metricsRef.current.startedAt);
        disposed = true;
        clearTimeout(timerRef.current);
        clearStall();
        clearTimeout(preloadTimerRef.current);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('stalled', onWaiting);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('loadeddata', requestPlayback);
        video.onerror = null;
        destroyHls();
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        readyRef.current = false;
      };
    }, [src, shouldLoad, isActive, retryKey]);

    // ── Play / pause ─────────────────────────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const hls = hlsRef.current as { startLoad: () => void } | null;
      if (isActive && shouldLoad) {
        video.muted = muted;
        clearTimeout(preloadTimerRef.current);
        hls?.startLoad();
        if (ready) video.play().catch(() => {});
      } else { video.pause(); setBuffering(false); }
    }, [isActive, ready, shouldLoad, muted]);

    // Offscreen players never fetch or decode video. Adjacent channel metadata stays in the feed.

    // ── PiP events ───────────────────────────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const onEnter = () => setPipActive(true);
      const onLeave = () => setPipActive(false);
      video.addEventListener('enterpictureinpicture', onEnter);
      video.addEventListener('leavepictureinpicture', onLeave);
      return () => {
        video.removeEventListener('enterpictureinpicture', onEnter);
        video.removeEventListener('leavepictureinpicture', onLeave);
      };
    }, []);

    const handlePiP = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture().catch(() => {});
      } else {
        await videoRef.current?.requestPictureInPicture().catch(() => {});
      }
    };

    const handleQualityChange = useCallback((level: number) => {
      const hls = hlsRef.current as { currentLevel: number } | null;
      if (hls) hls.currentLevel = level;
      setCurrentLvl(level);
      setShowQuality(false);
    }, []);

    const handleRetry = (e: React.MouseEvent) => {
      e.stopPropagation();
      setError(false);
      setBuffering(true);
      setReady(false);
      readyRef.current = false;
      retryCount.current = 0;
      setRetryKey(key => key + 1);
    };

    const currentQualityLabel = qualities.find(q => q.level === currentLvl)?.label || 'Auto';

    return (
      <div
        className="absolute inset-0 bg-black cursor-pointer"
        onClick={() => { setMuted(m => !m); setShowQuality(false); }}
      >
        {/* ── Video element: object-contain keeps original TV aspect ratio ── */}
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          muted={muted}
          playsInline
          loop={false}
          preload="auto"
        />

        {/* Placeholder while loading */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
            {channelLogo ? (
              <img
                src={channelLogo}
                alt={channelName}
                className="w-28 h-28 object-contain opacity-35"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
                <span className="text-white text-4xl font-bold">{channelName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
        )}

        {/* Buffering spinner */}
        {buffering && !error && isActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div role="status" aria-label={ready ? 'Reconnecting stream' : 'Loading live stream'} className="flex flex-col items-center gap-3 rounded-2xl bg-black/60 px-6 py-5 backdrop-blur-sm"><div className="w-10 h-10 rounded-full border-white/20 border-t-white animate-spin" style={{ borderWidth: 3 }} /><span className="text-xs font-semibold text-white/80">{ready ? 'Reconnecting live stream…' : 'Preparing live stream…'}</span></div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="bg-black/60 backdrop-blur rounded-2xl p-6 flex flex-col items-center gap-3">
              <WifiOff className="w-9 h-9 text-white/40" />
              <p className="text-white/50 text-sm">Stream unavailable</p>
              <button
                className="pointer-events-auto flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm px-4 py-2 rounded-full transition-colors"
                onClick={handleRetry}
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Mute indicator */}
        <div className="absolute top-16 right-4 pointer-events-none">
          <div className="bg-black/50 backdrop-blur rounded-full p-1.5">
            {muted
              ? <VolumeX className="w-4 h-4 text-white/80" />
              : <Volume2 className="w-4 h-4 text-white/80" />}
          </div>
        </div>

        {/* LIVE badge */}
        {ready && !error && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-md">
            <div className="w-1.5 h-1.5 bg-white rounded-full live-dot" />
            LIVE
          </div>
        )}

        {/* Top-right controls */}
        {ready && !error && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Quality selector */}
            {qualities.length > 1 && (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowQuality(v => !v); }}
                  className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1.5 rounded-lg hover:bg-black/70 transition-colors"
                >
                  <Settings2 className="w-3 h-3" />
                  {currentQualityLabel}
                </button>

                {showQuality && (
                  <div
                    className="absolute top-full right-0 mt-1 bg-black/90 backdrop-blur-xl border border-white/15 rounded-xl overflow-hidden min-w-[100px] z-50"
                    onClick={e => e.stopPropagation()}
                  >
                    {qualities.map(q => (
                      <button
                        key={q.level}
                        onClick={() => handleQualityChange(q.level)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors',
                          q.level === currentLvl ? 'text-primary font-semibold' : 'text-white/80'
                        )}
                      >
                        <span>{q.label}</span>
                        {q.bitrate > 0 && (
                          <span className="text-white/30 text-[10px]">{Math.round(q.bitrate / 1000)}k</span>
                        )}
                        {q.level === currentLvl && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PiP button */}
            {pipSupported && (
              <button
                onClick={handlePiP}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  pipActive ? 'bg-primary' : 'bg-black/50 hover:bg-black/70 backdrop-blur-sm'
                )}
              >
                <PictureInPicture2 className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
export default VideoPlayer;
