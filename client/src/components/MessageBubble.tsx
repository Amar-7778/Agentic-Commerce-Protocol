import React from 'react';
import { Bot } from 'lucide-react';
import { ChatMessage } from '../types.js';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.sender === 'user';
  const isSystem = message.sender === 'system';
  if (!message.text) return null;

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
      }}>
        {!isUser && <Bot size={12} color="var(--accent-terracotta)" />}
        <span style={{ fontWeight: 600, color: isUser ? 'var(--accent-terracotta)' : 'var(--text-secondary)' }}>
          {isUser ? 'You' : isSystem ? 'System' : 'Shopper Agent'}
        </span>
        <span>· {message.timestamp}</span>
      </div>

      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
        background: isUser
          ? 'var(--bg-canvas)'
          : isSystem
          ? 'rgba(220, 38, 38, 0.08)'
          : '#FFFFFF',
        border: `1px solid ${
          isUser
            ? 'var(--border-medium)'
            : isSystem
            ? 'rgba(220, 38, 38, 0.25)'
            : 'var(--border-subtle)'
        }`,
        boxShadow: isUser ? 'none' : 'var(--shadow-sm)',
        color: 'var(--text-primary)',
        fontSize: '0.88rem',
        lineHeight: 1.5,
        whiteSpace: 'pre-line',
      }}>
        {message.text.replace(/\*\*/g, '').replace(/\*/g, '')}
      </div>
    </div>
  );
};
