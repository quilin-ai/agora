'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { ModelBadge } from '@/app/components/model-badge';
import type { ConversationListItem } from '@/lib/types';

const SUGGESTED_TOPICS = [
  '人工智能会取代大多数人类工作吗？',
  '远程工作是否比办公室工作更高效？',
  '加密货币是否代表货币的未来？',
  '基因编辑技术应该用于人类增强吗？',
  '核能是否是应对气候变化的最佳方案？',
  '社交媒体对民主是利大于弊还是弊大于利？',
];


export default function ChatPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [topic, setTopic] = useState('');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data: { items: ConversationListItem[] }) => {
        setConversations(data.items ?? []);
      })
      .catch(() => {});
  }, []);

  const handleStart = useCallback(async () => {
    if (!topic.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          mode: 'consensus',
          max_rounds: 3,
          idempotency_key: `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });

      const data = await res.json() as { id?: string; error?: { message: string } };

      if (!res.ok || !data.id) {
        setError(data.error?.message ?? '创建讨论失败，请重试');
        setIsCreating(false);
        return;
      }

      router.push(`/chat/${data.id}`);
    } catch {
      setError('网络错误，请检查连接后重试');
      setIsCreating(false);
    }
  }, [topic, isCreating, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleStart();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'hsl(0 0% 4%)' }}>
      {/* 左侧历史列表 */}
      <div style={{
        width: '260px',
        flexShrink: 0,
        borderRight: '1px solid hsl(0 0% 12%)',
        display: 'flex',
        flexDirection: 'column',
        background: 'hsl(0 0% 5%)',
      }}>
        <div style={{ padding: '16px 14px', borderBottom: '1px solid hsl(0 0% 12%)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'hsl(0 0% 70%)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            历史讨论
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {conversations.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: 'hsl(0 0% 40%)', fontSize: '12px' }}>
              还没有讨论记录
            </div>
          ) : (
            conversations.map((c) => (
              <a
                key={c.id}
                href={`/chat/${c.id}`}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  marginBottom: '2px',
                  background: 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'hsl(0 0% 10%)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
              >
                <div style={{ fontSize: '12px', color: 'hsl(0 0% 80%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title || '无标题讨论'}
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {c.models.slice(0, 3).map((m) => (
                    <ModelBadge key={m} modelId={m} size="sm" />
                  ))}
                </div>
              </a>
            ))
          )}
        </div>
      </div>

      {/* 主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: '680px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'hsl(0 0% 95%)', margin: '0 0 10px' }}>
              Agora <span style={{ color: '#D97706' }}>🏛️</span>
            </h1>
            <p style={{ fontSize: '15px', color: 'hsl(0 0% 55%)', margin: 0 }}>
              让 AI 模型互相辩论，帮你做更好的决策
            </p>
          </div>

          {/* 输入区 */}
          <div style={{ background: 'hsl(0 0% 7%)', border: '1px solid hsl(0 0% 18%)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你想要辩论的话题..."
              rows={3}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: '15px',
                color: 'hsl(0 0% 90%)',
                lineHeight: 1.6,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid hsl(0 0% 13%)' }}>
              <span style={{ fontSize: '11px', color: 'hsl(0 0% 40%)' }}>⌘↵ 发送</span>
              <button
                onClick={() => void handleStart()}
                disabled={!topic.trim() || isCreating}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: topic.trim() && !isCreating ? '#D97706' : 'hsl(0 0% 20%)',
                  color: topic.trim() && !isCreating ? '#fff' : 'hsl(0 0% 45%)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: topic.trim() && !isCreating ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {isCreating ? '启动中...' : '召集议会 🏛️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '13px', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          {/* 推荐话题 */}
          {!topic && (
            <div>
              <div style={{ fontSize: '12px', color: 'hsl(0 0% 40%)', marginBottom: '10px', textAlign: 'center' }}>
                试试这些话题
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {SUGGESTED_TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    style={{
                      padding: '10px 12px',
                      background: 'hsl(0 0% 7%)',
                      border: '1px solid hsl(0 0% 15%)',
                      borderRadius: '8px',
                      color: 'hsl(0 0% 75%)',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'hsl(0 0% 10%)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(0 0% 22%)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'hsl(0 0% 7%)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(0 0% 15%)';
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 用户信息 */}
          {session?.user && (
            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'hsl(0 0% 40%)' }}>
              {session.user.name ?? session.user.email}
              <a href="/api/auth/signout" style={{ marginLeft: '12px', color: 'hsl(0 0% 35%)', textDecoration: 'none' }}>退出</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
