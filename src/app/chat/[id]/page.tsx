'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { CouncilPanel } from '@/app/components/council-panel';
import { RoundProgressBar } from '@/app/components/round-progress-bar';
import { SummaryCard } from '@/app/components/summary-card';
import { useDiscussionSSE } from '@/lib/hooks/use-discussion-sse';
import { useChatStore } from '@/lib/store/chat-store';
import type { SSEEvent } from '@/lib/types';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function CouncilDetailPage() {
  const params = useParams<{ id: string }>();
  const discussionId = params.id;

  const {
    councilModels,
    currentRound,
    totalRounds,
    currentPhase,
    modelStreams,
    summary,
    status,
    isRestored,
    errorMessage,
    handleEvent: storeHandleEvent,
    setConversationId,
    setCouncilModels,
  } = useChatStore();

  const [topic, setTopic] = useState<string>('');
  const isMobile = useIsMobile();

  // 加载 discussion 基本信息
  useEffect(() => {
    if (!discussionId) return;
    fetch(`/api/discussions/${discussionId}`)
      .then((r) => r.json())
      .then((data: { discussion: { topic: string; models: string[]; type: 'chat' | 'council' } }) => {
        setTopic(data.discussion.topic ?? '');
        setCouncilModels(data.discussion.models ?? []);
        setConversationId(discussionId, data.discussion.type ?? 'council');
      })
      .catch(() => {});
  }, [discussionId, setConversationId, setCouncilModels]);

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      storeHandleEvent(event);
    },
    [storeHandleEvent]
  );

  useDiscussionSSE({
    discussionId,
    onEvent: handleEvent,
    enabled: !!discussionId,
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'hsl(0 0% 4%)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid hsl(0 0% 15%)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <a href="/chat" style={{ color: 'hsl(0 0% 55%)', textDecoration: 'none', fontSize: '13px' }}>← 返回</a>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'hsl(0 0% 90%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topic || '议会讨论'}
          </div>
          <div style={{ fontSize: '12px', color: 'hsl(0 0% 50%)' }}>
            {councilModels.length} 个模型参与
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* 恢复提示 */}
      {isRestored && (
        <div style={{ padding: '8px 20px', background: 'rgba(16,163,127,0.1)', borderBottom: '1px solid rgba(16,163,127,0.2)', fontSize: '12px', color: '#34D399' }}>
          ♻️ 已恢复到最近保存阶段
        </div>
      )}

      {/* 进度条 */}
      {status === 'streaming' && currentRound > 0 && councilModels.length > 0 && (
        <div style={{ padding: '12px 20px', flexShrink: 0 }}>
          <RoundProgressBar
            currentRound={currentRound}
            totalRounds={totalRounds}
            phase={currentPhase}
            models={councilModels}
            modelStreams={modelStreams}
          />
        </div>
      )}

      {/* 主要内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 错误 */}
        {status === 'error' && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '16px', color: '#FCA5A5' }}>
            ❌ {errorMessage ?? '讨论发生错误'}
          </div>
        )}

        {/* 议会面板 */}
        {councilModels.length > 0 && (status === 'streaming' || status === 'completed' || status === 'restore') && (
          <div style={{ flex: status === 'streaming' ? 1 : 'none', minHeight: status === 'streaming' ? '400px' : 'auto' }}>
            <CouncilPanel
              models={councilModels}
              streams={modelStreams}
              currentRound={currentRound}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* 总结卡片 */}
        {summary && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'hsl(0 0% 70%)', marginBottom: '10px' }}>📋 书记员总结</div>
            <SummaryCard summary={summary} />
          </div>
        )}

        {/* 等待状态 */}
        {status === 'idle' && !summary && (
          <div style={{ textAlign: 'center', color: 'hsl(0 0% 50%)', fontSize: '14px', padding: '40px' }}>
            等待讨论开始...
          </div>
        )}
      </div>

      {/* 底部追问区 */}
      {status === 'completed' && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid hsl(0 0% 15%)', background: 'hsl(0 0% 6%)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <span style={{ fontSize: '12px', color: 'hsl(0 0% 50%)' }}>💬 讨论已完成</span>
            <a
              href="/chat"
              style={{ marginLeft: 'auto', fontSize: '13px', color: '#D97706', textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '6px' }}
            >
              🔥 发起新讨论
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    idle: { label: '待开始', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
    streaming: { label: '讨论中', color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
    completed: { label: '已完成', color: '#10A37F', bg: 'rgba(16,163,127,0.1)' },
    followup: { label: '追问中', color: '#4285F4', bg: 'rgba(66,133,244,0.1)' },
    error: { label: '出现错误', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
    restore: { label: '已恢复', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  };

  const config = configs[status] ?? configs.idle;
  return (
    <span style={{
      fontSize: '11px',
      padding: '3px 8px',
      borderRadius: '12px',
      color: config.color,
      background: config.bg,
      fontWeight: 600,
      flexShrink: 0,
    }}>
      {config.label}
    </span>
  );
}
