import { create } from 'zustand';

import type { SSEEvent, Conversation, Message, DiscussionSummaryFinal } from '@/lib/types';

export type ChatStatus = 'idle' | 'streaming' | 'completed' | 'followup' | 'error' | 'restore';

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

interface ChatState {
  conversationId: string | null;
  type: 'chat' | 'council' | null;
  status: ChatStatus;
  currentModelId: string;
  messages: Message[];
  councilModels: string[];
  currentRound: number;
  totalRounds: number;
  currentPhase: string;
  modelStreams: Record<string, ModelStream>;
  summary: DiscussionSummaryFinal | null;
  followupMode: 'ask_secretary' | 'ask_model' | 'new_council' | null;
  isRestored: boolean;
  errorMessage: string | null;

  // Actions
  setConversationId: (id: string, type: 'chat' | 'council') => void;
  setCurrentModelId: (modelId: string) => void;
  setCouncilModels: (models: string[]) => void;
  handleEvent: (event: SSEEvent) => void;
  handleRestore: (discussion: Conversation, completedMessages: Message[]) => void;
  setFollowupMode: (mode: ChatState['followupMode']) => void;
  reset: () => void;
}

const initialState: Omit<ChatState, 'setConversationId' | 'setCurrentModelId' | 'setCouncilModels' | 'handleEvent' | 'handleRestore' | 'setFollowupMode' | 'reset'> = {
  conversationId: null,
  type: null,
  status: 'idle',
  currentModelId: '',
  messages: [],
  councilModels: [],
  currentRound: 0,
  totalRounds: 3,
  currentPhase: '',
  modelStreams: {},
  summary: null,
  followupMode: null,
  isRestored: false,
  errorMessage: null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  setConversationId(id, type) {
    set({ conversationId: id, type, status: 'streaming' });
  },

  setCurrentModelId(modelId) {
    set({ currentModelId: modelId });
  },

  setCouncilModels(models) {
    set({ councilModels: models });
  },

  setFollowupMode(mode) {
    set({ followupMode: mode });
  },

  handleEvent(event) {
    const state = get();
    switch (event.type) {
      case 'progress':
        set({
          currentRound: event.data.round,
          totalRounds: event.data.total_rounds,
          currentPhase: event.data.phase,
          status: 'streaming',
        });
        break;

      case 'chunk': {
        const { logical_model_id, content, done } = event.data;
        const streams = { ...state.modelStreams };
        const existing = streams[logical_model_id];
        streams[logical_model_id] = {
          logicalModelId: logical_model_id,
          content: (existing?.content ?? '') + content,
          done,
          isError: false,
          isSkipped: false,
          isDegraded: existing?.isDegraded ?? false,
          degradedTo: existing?.degradedTo,
        };
        set({ modelStreams: streams });
        break;
      }

      case 'model_done': {
        const streams = { ...state.modelStreams };
        const existing = streams[event.data.logical_model_id];
        if (existing) {
          streams[event.data.logical_model_id] = { ...existing, done: true };
          set({ modelStreams: streams });
        }
        break;
      }

      case 'model_error': {
        const { logical_model_id, action, degraded_to, message } = event.data;
        if (action === 'skipped') {
          const streams = { ...state.modelStreams };
          streams[logical_model_id] = {
            logicalModelId: logical_model_id,
            content: '',
            done: true,
            isError: true,
            errorMessage: message,
            isSkipped: true,
            isDegraded: false,
          };
          set({ modelStreams: streams });
        } else if (action === 'degraded' && degraded_to) {
          const streams = { ...state.modelStreams };
          const existing = streams[logical_model_id];
          streams[logical_model_id] = {
            ...(existing ?? { logicalModelId: logical_model_id, content: '', done: false, isError: false, isSkipped: false }),
            isDegraded: true,
            degradedTo: degraded_to,
          };
          set({ modelStreams: streams });
        }
        break;
      }

      case 'round_done':
        // Preserve streams across rounds but reset for new round on next progress event
        break;

      case 'summary':
        set({ summary: event.data });
        break;

      case 'done':
        set({ status: 'completed' });
        break;

      case 'error':
        set({ status: 'error', errorMessage: event.data.message });
        break;

      case 'restore': {
        const { can_stream, current_status, current_round, completed_round_messages, summary } = event.data;
        set({
          currentRound: current_round,
          messages: completed_round_messages,
          summary: summary ?? null,
          isRestored: true,
          status: can_stream ? 'streaming' : (current_status === 'completed' ? 'completed' : 'idle'),
        });
        break;
      }

      default:
        break;
    }
  },

  handleRestore(discussion, completedMessages) {
    set({
      conversationId: discussion.id,
      type: discussion.type as 'chat' | 'council',
      currentRound: discussion.current_round,
      messages: completedMessages,
      summary: discussion.summary ?? null,
      isRestored: true,
      status: discussion.status === 'completed' ? 'completed' : 'idle',
      councilModels: discussion.models ?? [],
    });
  },

  reset() {
    set({ ...initialState });
  },
}));
