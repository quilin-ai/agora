'use client';

import { getModelColor, getModelDisplayName } from '@/lib/constants';

interface ModelStream {
  logicalModelId: string;
  content: string;
  done: boolean;
  isError: boolean;
  errorMessage?: string;
  isSkipped: boolean;
  isDegraded: boolean;
  degradedTo?: string;
}

interface CouncilPanelProps {
  models: string[];
  streams: Record<string, ModelStream>;
  currentRound: number;
  isMobile?: boolean;
}

function ModelCard({ modelId, stream, currentRound: _currentRound }: { modelId: string; stream?: ModelStream; currentRound: number }) {
  const color = getModelColor(modelId);
  const name = getModelDisplayName(modelId);
  const isStreaming = stream && !stream.done && !stream.isSkipped;

  return (
    <div style={{
      background: 'hsl(0 0% 7%)',
      border: `1px solid ${isStreaming ? color : 'hsl(0 0% 15%)'}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '10px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      height: '100%',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
      minHeight: '200px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, opacity: isStreaming ? 1 : 0.5 }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(0 0% 90%)' }}>{name}</span>
        {stream?.isDegraded && stream.degradedTo && (
          <span style={{ fontSize: '10px', color: '#F59E0B', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>
            降级
          </span>
        )}
        {isStreaming && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: color, animation: 'pulse 1.5s ease-in-out infinite' }}>
            ●
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', fontSize: '13px', color: 'hsl(0 0% 82%)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {stream?.isSkipped ? (
          <span style={{ color: 'hsl(0 0% 50%)', fontStyle: 'italic' }}>⏰ 本轮跳过</span>
        ) : stream?.isError ? (
          <span style={{ color: '#EF4444', fontStyle: 'italic' }}>{stream.errorMessage ?? '发生错误'}</span>
        ) : stream?.content ? (
          stream.content
        ) : (
          <span style={{ color: 'hsl(0 0% 35%)', fontStyle: 'italic' }}>等待回应...</span>
        )}
      </div>
    </div>
  );
}

export function CouncilPanel({ models, streams, currentRound, isMobile }: CouncilPanelProps) {
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {models.map((modelId) => (
          <ModelCard key={modelId} modelId={modelId} stream={streams[modelId]} currentRound={currentRound} />
        ))}
      </div>
    );
  }

  const cols = models.length <= 2 ? models.length : 2;
  const rows = Math.ceil(models.length / cols);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: '12px',
      height: '100%',
    }}>
      {models.map((modelId) => (
        <ModelCard key={modelId} modelId={modelId} stream={streams[modelId]} currentRound={currentRound} />
      ))}
    </div>
  );
}
