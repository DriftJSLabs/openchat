"use client";

import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface MessageItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    messages: Message[];
    renderMessage: (message: Message, index: number) => React.ReactNode;
  };
}

function MessageItem({ index, style, data }: MessageItemProps) {
  const { messages, renderMessage } = data;
  const message = messages[index];
  
  if (!message) return null;
  
  return (
    <div style={style}>
      {renderMessage(message, index)}
    </div>
  );
}

interface VirtualizedMessageListProps {
  messages: Message[];
  renderMessage: (message: Message, index: number) => React.ReactNode;
  height: number;
  itemHeight?: number;
  className?: string;
}

export function VirtualizedMessageList({
  messages,
  renderMessage,
  height,
  itemHeight = 100, // Default estimated height
  className,
}: VirtualizedMessageListProps) {
  const itemData = useMemo(() => ({
    messages,
    renderMessage
  }), [messages, renderMessage]);

  // Don't virtualize for small lists (< 50 items)
  if (messages.length < 50) {
    return (
      <div className={className} style={{ height }}>
        {messages.map((message, index) => renderMessage(message, index))}
      </div>
    );
  }

  return (
    <div className={className}>
      <List
        height={height}
        itemCount={messages.length}
        itemSize={itemHeight}
        itemData={itemData}
        overscanCount={5} // Render 5 extra items for smooth scrolling
      >
        {MessageItem}
      </List>
    </div>
  );
}