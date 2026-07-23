import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, RefreshCw, Loader2, ShieldAlert, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllChannels, getChannelById, markChannelDead } from '@/lib/iptvApi';
import { cn, formatCount } from '@/lib/utils';
import type { IPTVChannel } from '@/types';
import Header from '@/components/layout/Header';

interface ReportSummary {
  channel_id: string;
  count: number;
  latest_reason: string;
  latest_at: string;
  channel?: IPTVChannel;
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'dead';

interface TestResult {
  channelId: string;
  status: TestStatus;
}

async function testStreamReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5_000),
      mode: 'no-cors',
    });
    return true; // no-cors always returns opaque response, assume reachable
  } catch {
    // Try a range request as fallback
    try {
      await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5_000), mode: 'no-cors' });
      return true;
    } catch {
      return false;
    }
  }
}

export default function StreamHealth() {
  const navigate = useNavigate();
  const [reports,   setReports]  = useState<ReportSummary[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [testing,   setTesting]  = useState<Set<string>>(new Set());
  const [results,   setResults]  = useState<Map<string, TestStatus>>(new Map());
  const [allChannelCount, setAllChannelCount] = useState(0);

  useEffect(() => {
    loadReports();
    fetchAllChannels().then(ch => setAllChannelCount(ch.length));
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('reports')
        .select('channel_id, reason, created_at')
        .order('created_at', { ascending: false });

      if (!data) { setLoading(false); return; }

      // Group by channel_id
      const grouped = new Map<string, ReportSummary>();
      for (const r of data) {
        if (!grouped.has(r.channel_id)) {
          grouped.set(r.channel_id, {
            channel_id:    r.channel_id,
            count:         0,
            latest_reason: r.reason,
            latest_at:     r.created_at,
          });
        }
        const entry = grouped.get(r.channel_id)!;
        entry.count++;
      }

      // Attach channel metadata
      const summaries = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
      for (const s of summaries) {
        s.channel = getChannelById(s.channel_id);
      }

      setReports(summaries);
    } finally {
      setLoading(false);
    }
  };

  const testChannel = async (channelId: string, streamUrl: string) => {
    setTesting(prev => new Set([...prev, channelId]));
    setResults(prev => new Map([...prev, [channelId, 'testing']]));

    const ok = await testStreamReachable(streamUrl);
    const status: TestStatus = ok ? 'ok' : 'dead';

    if (!ok) markChannelDead(channelId);

    setResults(prev => new Map([...prev, [channelId, status]]));
    setTesting(prev => { const s = new Set(prev); s.delete(channelId); return s; });
  };

  const testAll = async () => {
    const toTest = reports.filter(r => r.channel?.streamUrl && !testing.has(r.channel_id));
    for (const r of toTest) {
      if (r.channel?.streamUrl) {
        await testChannel(r.channel_id, r.channel.streamUrl);
      }
    }
  };

  const getStatusIcon = (id: string) => {
    const status = results.get(id);
    if (testing.has(id)) return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    if (status === 'ok')  return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === 'dead') return <XCircle className="w-4 h-4 text-red-400" />;
    return <Activity className="w-4 h-4 text-foreground/30" />;
  };

  const testedOk   = Array.from(results.values()).filter(s => s === 'ok').length;
  const testedDead = Array.from(results.values()).filter(s => s === 'dead').length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header liveCount={0} totalChannels={allChannelCount} />

      {/* Hero bar */}
      <div className="bg-gradient-to-r from-red-900/40 via-black to-black border-b border-white/8 px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h1 className="text-foreground font-black text-xl">Stream Health</h1>
            </div>
            <p className="text-foreground/50 text-xs">User-reported channels & stream tests</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Reported', value: reports.length, color: 'text-yellow-400' },
            { label: 'Tested', value: results.size, color: 'text-blue-400' },
            { label: 'Online', value: testedOk, color: 'text-green-400' },
            { label: 'Dead', value: testedDead, color: 'text-red-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-white/5 rounded-2xl p-3 text-center border border-white/8">
              <p className={cn('text-xl font-black', stat.color)}>{stat.value}</p>
              <p className="text-foreground/40 text-[10px] font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex items-center gap-2">
        <button
          onClick={loadReports}
          disabled={loading}
          className="flex items-center gap-2 bg-white/8 hover:bg-white/12 text-foreground/80 text-sm px-4 py-2 rounded-full border border-white/10 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
        <button
          onClick={testAll}
          disabled={reports.length === 0 || testing.size > 0}
          className="flex items-center gap-2 bg-primary/90 hover:bg-primary text-white text-sm px-4 py-2 rounded-full transition-colors disabled:opacity-40"
        >
          <Activity className="w-3.5 h-3.5" />
          Test All Streams
        </button>
      </div>

      {/* Report list */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <CheckCircle className="w-14 h-14 text-green-400/30" />
            <p className="text-foreground/40 text-sm font-medium">No reports yet</p>
            <p className="text-foreground/25 text-xs text-center max-w-[200px]">
              Channels reported by users via the report button will appear here
            </p>
          </div>
        ) : (
          reports.map(r => {
            const status = results.get(r.channel_id);
            return (
              <div
                key={r.channel_id}
                className={cn(
                  'bg-card border rounded-2xl p-4 transition-colors',
                  status === 'dead' ? 'border-red-500/30 bg-red-900/10' :
                  status === 'ok'   ? 'border-green-500/20 bg-green-900/5' :
                  'border-white/8'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Logo */}
                  {r.channel?.logo ? (
                    <img src={r.channel.logo} alt={r.channel.name}
                      className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-yellow-400/60" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-foreground font-semibold text-sm truncate">
                          {r.channel?.name || r.channel_id}
                        </p>
                        <p className="text-foreground/40 text-[10px] mt-0.5">
                          {r.count} report{r.count !== 1 ? 's' : ''} · "{r.latest_reason}"
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {getStatusIcon(r.channel_id)}
                        {status === 'ok'   && <span className="text-green-400 text-[10px] font-semibold">Online</span>}
                        {status === 'dead' && <span className="text-red-400 text-[10px] font-semibold">Offline</span>}
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex items-center gap-2 mt-2">
                      {r.channel?.countryCode && (
                        <span className="text-[10px] bg-white/8 text-foreground/50 px-2 py-0.5 rounded-full border border-white/8">
                          {r.channel.countryCode}
                        </span>
                      )}
                      {r.channel?.categories?.[0] && (
                        <span className="text-[10px] bg-white/8 text-foreground/50 px-2 py-0.5 rounded-full border border-white/8 capitalize">
                          {r.channel.categories[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Test button */}
                {r.channel?.streamUrl && (
                  <button
                    onClick={() => testChannel(r.channel_id, r.channel!.streamUrl)}
                    disabled={testing.has(r.channel_id)}
                    className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-foreground/60 bg-white/5 hover:bg-white/10 border border-white/8 py-2 rounded-xl transition-colors disabled:opacity-40"
                  >
                    {testing.has(r.channel_id) ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</>
                    ) : (
                      <><Activity className="w-3 h-3" /> Test Stream</>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
