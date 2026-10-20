
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
    const readyRef    = useRef(false);
    const retryCount  = useRef(0);
    const activeRef = useRef(isActive);
    const shouldLoadRef = useRef(shouldLoad);
    // Parent callbacks may be recreated during scrolling; keep current handlers without
    // tearing down and reinitialising a healthy stream on every render.
    const onErrorRef = useRef(onError);
    const onReadyRef = useRef(onReady);
    const nativeHlsRef = useRef(false);
    const recoveryRef = useRef<ReturnType<typeof setTimeout>>();
    const startupTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const startupFallbackRef = useRef(false);
    activeRef.current = isActive;
    shouldLoadRef.current = shouldLoad;
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
      if (!shouldLoad || !src) {
        setReady(false);
        setBuffering(false);
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      setError(false);
      setReady(false);
      setBuffering(true);
      clearTimeout(startupTimerRef.current);
      startupFallbackRef.current = false;
      setQualities([]);
      setCurrentLvl(-1);
      readyRef.current = false;

      retryCount.current = 0;
      // Only the selected stream gets a startup deadline. Give slower providers a fair chance.
      if (activeRef.current && document.visibilityState !== 'hidden') {
        timerRef.current = setTimeout(() => {
          if (video.paused && activeRef.current) {
            setError(true);
            setBuffering(false);
            onErrorRef.current?.();
          }
        }, 18_000);
      }

      const markReady = () => {
        if (disposed) return;
        if (readyRef.current) return;
        readyRef.current = true;
        setReady(true);
        retryCount.current = 0;
        onReadyRef.current?.();
        tryStartPlayback();
      };

      let disposed = false;

      // Start as soon as a small safety buffer is available; continue filling toward 15s while playing.
      // Live playlists may have short segments or limited DVR windows, so use a brief fallback.
      const tryStartPlayback = () => {
        if (disposed || !activeRef.current || document.visibilityState === 'hidden' || !readyRef.current || !video.paused) return;
        let ahead = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (video.currentTime >= start - 0.25 && video.currentTime <= end) {
            ahead = end - video.currentTime;
            break;
          }
        }
        // Start quickly once a small safety buffer exists; keep filling toward the larger target during playback.
        if (ahead >= 3 || startupFallbackRef.current) video.play().catch(() => {});
      };

      // The selected stream may start after a short buffer target or the bounded startup fallback.
      if (activeRef.current && document.visibilityState !== 'hidden') {
        startupTimerRef.current = setTimeout(() => {
          startupFallbackRef.current = true;
          tryStartPlayback();
        }, 4000);
      }
      const markError = () => {
        if (disposed) return;
        clearTimeout(timerRef.current);
        setError(true);
        setBuffering(false);
        onErrorRef.current?.();
      };

      const destroyHls = () => {
        if (hlsRef.current) {
          (hlsRef.current as { destroy: () => void }).destroy();
          hlsRef.current = null;
        }
      };

      const onWaiting = () => {
        if (disposed || !activeRef.current || !readyRef.current) return;
        setBuffering(true);
        clearTimeout(recoveryRef.current);
        recoveryRef.current = setTimeout(() => {
          if (disposed || !activeRef.current || document.visibilityState === 'hidden') return;
          const hls = hlsRef.current as { startLoad?: () => void } | null;
          // A network stall is not proof of a decoder fault. Restart loading only;
          // recoverMediaError() resets the media pipeline and can worsen a healthy stream.
          try { hls?.startLoad?.(); } catch { /* transient reconnect */ }
        }, 3500);
      };
      const onPlaying = () => { markReady(); if (!disposed) { clearTimeout(timerRef.current); setBuffering(false); clearTimeout(recoveryRef.current); clearTimeout(startupTimerRef.current); } };
      const onCanPlay = () => { if (!disposed) tryStartPlayback(); };
      const onProgress = () => tryStartPlayback();
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('stalled', onWaiting);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('progress', onProgress);
      video.addEventListener('loadeddata', markReady);

      const init = async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (disposed) return;
          destroyHls();

          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker:           true,
              // Keep inactive neighbours from downloading media segments. Start network loading only for the visible player.
              autoStartLoad:           false,
              // Prefer a healthy forward buffer over ultra-low latency to reduce stalls.
              lowLatencyMode:         false,
              // Bound memory on Android while keeping a useful forward buffer.
              maxBufferLength:        18,
              maxMaxBufferLength:     30,
              maxBufferSize:          24 * 1000 * 1000,
              backBufferLength:       8,
              maxBufferHole:          0.5,
              startFragPrefetch:      true,
              startLevel:             -1,
              // Start conservatively on variable mobile connections; ABR can ramp up.
              abrEwmaDefaultEstimate: 650_000,
              abrBandWidthFactor:     0.8,
              abrBandWidthUpFactor:   0.6,
              progressive:            true,
              // Fail dead manifests/segments faster instead of spending a minute in internal retries.
              manifestLoadingTimeOut: 8_000,
              levelLoadingTimeOut:    10_000,
              fragLoadingTimeOut:     12_000,
              manifestLoadingMaxRetry: 3,
              levelLoadingMaxRetry:    3,
              fragLoadingMaxRetry:     4,
              manifestLoadingMaxRetryTimeout: 8_000,
              levelLoadingMaxRetryTimeout:    8_000,
              fragLoadingMaxRetryTimeout:    12_000,
            });
            hlsRef.current = hls;

            hls.loadSource(src);
            hls.attachMedia(video);

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
              if (activeRef.current && document.visibilityState !== 'hidden') hls.startLoad();
              else hls.stopLoad();
              tryStartPlayback();
              // A parsed playlist alone does not mean media segments are playable.
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (_: unknown, data: { level: number }) => {
              setCurrentLvl(data.level);
            });

            hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal: boolean; type: string }) => {
              if (!d.fatal || disposed || !activeRef.current || document.visibilityState === 'hidden') return;
              // Retry transient CDN/network failures with backoff before giving up.
              if (retryCount.current < 4 && d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                retryCount.current++;
                clearTimeout(recoveryRef.current);
                recoveryRef.current = setTimeout(() => {
                  if (!disposed && activeRef.current) hls.startLoad();
                }, Math.min(1000 * 2 ** (retryCount.current - 1), 8000));
              } else if (retryCount.current < 4 && d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                retryCount.current++;
                try { hls.recoverMediaError(); } catch { markError(); }
              } else if (retryCount.current < 4) {
                retryCount.current++;
                clearTimeout(recoveryRef.current);
                recoveryRef.current = setTimeout(() => {
                  if (!disposed && activeRef.current && document.visibilityState !== 'hidden') hls.startLoad();
                }, Math.min(1000 * 2 ** (retryCount.current - 1), 8000));
              } else {
                markError();
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS can eagerly fetch on src assignment, so attach it only when this player is selected.
            nativeHlsRef.current = true;
            if (activeRef.current && document.visibilityState !== 'hidden') {
              video.src = src;
              video.onerror = markError;
              video.load();
            }
          } else {
            markError();
          }
        } catch {
          markError();
        }
      };

      init();

      return () => {
        disposed = true;
        clearTimeout(timerRef.current);
        clearTimeout(recoveryRef.current);
        clearTimeout(startupTimerRef.current);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('stalled', onWaiting);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('progress', onProgress);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('loadeddata', markReady);
        video.onerror = null;
        destroyHls();
        nativeHlsRef.current = false;
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        readyRef.current = false;
      };
    }, [src, shouldLoad, retryKey]);

    // ── Play / pause ─────────────────────────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const hls = hlsRef.current as { startLoad?: () => void; stopLoad?: () => void } | null;
      if (isActive && shouldLoad && document.visibilityState !== 'hidden') {
        // Only the selected card may download media segments; inactive cards are not initialised.
        try { hls?.startLoad?.(); } catch { /* player may still be initializing */ }
        if (nativeHlsRef.current && video.getAttribute('src') !== src) {
          video.src = src;
          video.load();
        }
        if (!readyRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            if (video.paused && activeRef.current && document.visibilityState !== 'hidden') {
              setError(true);
              setBuffering(false);
              onErrorRef.current?.();
            }
          }, 18_000);
        }
        if (ready) {
          let ahead = 0;
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.currentTime >= video.buffered.start(i) - 0.25 && video.currentTime <= video.buffered.end(i)) {
              ahead = video.buffered.end(i) - video.currentTime;
              break;
            }
          }
          if (ahead >= 3 || startupFallbackRef.current) {
            clearTimeout(startupTimerRef.current);
            video.play().catch(() => {});
          } else {
            // Keep the startup deadline short; the player continues buffering while playback runs.
            clearTimeout(startupTimerRef.current);
            startupTimerRef.current = setTimeout(() => {
              if (activeRef.current && shouldLoad && document.visibilityState !== 'hidden') {
                startupFallbackRef.current = true;
                video.play().catch(() => {});
              }
            }, 4000);
          }
        }
      } else {
        // Stop playback immediately on scroll, route changes, and hidden documents.
        video.pause();
        try { hls?.stopLoad?.(); } catch { /* HLS may already be destroyed */ }
        setBuffering(false);
        clearTimeout(recoveryRef.current);
      }
    }, [isActive, ready, shouldLoad, src]);

    // Pause and release network activity when the app is backgrounded; resume only the selected player.
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const onVisibilityChange = () => {
        const hls = hlsRef.current as { startLoad?: () => void; stopLoad?: () => void } | null;
        if (document.visibilityState === 'hidden') {
          video.pause();
          try { hls?.stopLoad?.(); } catch { /* stream may already be stopped */ }
          clearTimeout(recoveryRef.current);
          clearTimeout(startupTimerRef.current);
          return;
        }
        if (activeRef.current && shouldLoadRef.current) {
          try { hls?.startLoad?.(); } catch { /* player may still be initializing */ }
          // Native HLS is lazy-attached for inactive cards to avoid competing downloads.
          if (nativeHlsRef.current && video.getAttribute('src') !== src) {
            video.src = src;
            video.load();
          }
          if (!readyRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              if (video.paused && activeRef.current && document.visibilityState !== 'hidden') {
                setError(true);
                setBuffering(false);
                onErrorRef.current?.();
              }
            }, 18_000);
          }
          clearTimeout(startupTimerRef.current);
          startupFallbackRef.current = false;
          startupTimerRef.current = setTimeout(() => {
            if (activeRef.current && shouldLoadRef.current && document.visibilityState !== 'hidden') {
              startupFallbackRef.current = true;
              video.play().catch(() => {});
            }
          }, 4_000);
        }
      };
      const onPageHide = () => {
        video.pause();
        const hls = hlsRef.current as { stopLoad?: () => void } | null;
        try { hls?.stopLoad?.(); } catch { /* ignored during page teardown */ }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
      };
    }, [src]);

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
          preload="none"
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
            <div role="status" aria-label={ready ? 'Buffering for smooth playback' : 'Loading live stream'} className="flex flex-col items-center gap-3 rounded-2xl bg-black/60 px-6 py-5 backdrop-blur-sm"><div className="w-10 h-10 rounded-full border-white/20 border-t-white animate-spin" style={{ borderWidth: 3 }} /><span className="text-xs font-semibold text-white/80">{ready ? 'Buffering for smooth playback…' : 'Preparing live stream…'}</span></div>
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
