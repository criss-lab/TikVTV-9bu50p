import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IPTVChannel, AuthUser } from '@/types';
import VideoPlayer from './VideoPlayer';
import ChannelInfo from './ChannelInfo';
import ReactionBar from './ReactionBar';
import CommentSheet from './CommentSheet';
import { useComments } from '@/hooks/useComments';
import { reportStreamHealth } from '@/lib/streamHealth';

interface Props {
  channel:        IPTVChannel;
  isActive:       boolean;
  shouldLoad:     boolean; // within ±2 of active → preload HLS
  index:          number;
  user:           AuthUser | null;
  onAuthRequired: () => void;
  onChannelDead:  (id: string) => void;
  onChannelReady: (id: string) => void;
}

export default function ChannelCard({
  channel, isActive, shouldLoad, index,
  user, onAuthRequired, onChannelDead, onChannelReady,
}: Props) {
  const [showComments, setShowComments] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const { count, fetchCount }           = useComments(channel.id);
  const navigate                        = useNavigate();
  const sharedOnReady                   = useRef(false);

  useEffect(() => {
    if (isActive) fetchCount();
  }, [isActive, fetchCount]);

  const handleError = useCallback(() => {
    // Keep the card mounted so VideoPlayer can retry transient stream failures.
    setStreamFailed(true);
    reportStreamHealth(channel.id, false);
  }, [channel.id]);

  const handleReady = useCallback(() => {
    setStreamFailed(false);
    reportStreamHealth(channel.id, true);
    if (!sharedOnReady.current) {
      sharedOnReady.current = true;
      onChannelReady(channel.id);
    }
  }, [channel.id, onChannelReady]);

  return (
    <div
      data-index={index}
      className="relative w-full bg-black"
      style={{ height: '100dvh', scrollSnapAlign: 'start' }}
    >
      {/* Video — only initialise HLS when shouldLoad */}
      <VideoPlayer
        src={channel.streamUrl}
        isActive={isActive}
        shouldLoad={shouldLoad}
        channelName={channel.name}
        channelLogo={channel.logo}
        onError={handleError}
        onReady={handleReady}
      />

      {streamFailed && (
        <button
          type="button"
          onClick={() => onChannelDead(channel.id)}
          className="absolute top-16 left-4 z-20 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
        >
          Skip unavailable channel →
        </button>
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 pointer-events-none gradient-overlay" />
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none gradient-top" />

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 flex items-end justify-between gap-4">
        <div className="flex-1 min-w-0 pb-1">
          <button className="text-left w-full" onClick={() => navigate(`/channel/${channel.id}`)}>
            <ChannelInfo channel={channel} />
          </button>
        </div>

        <div className="flex-shrink-0 pb-2">
          <ReactionBar
            channel={channel}
            user={user}
            commentCount={count}
            onCommentClick={() => setShowComments(true)}
            onAuthRequired={onAuthRequired}
          />
        </div>
      </div>

      {showComments && (
        <CommentSheet
          channelId={channel.id}
          channelName={channel.name}
          user={user}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
}
