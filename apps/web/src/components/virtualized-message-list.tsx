"use client";

import React, { useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';

interface Message {
  _id: string;
  content: string;
  role: string;
  _creationTime: number;
}

interface VirtualizedMessageListProps {
  messages: Message[];
  renderMessage: (message: Message, index: number) => React.ReactNode;
  height: number;
  itemHeight?: number;
  threshold?: number;
}

const ITEM_HEIGHT = 100; // Estimated height per message
const VIRTUALIZATION_THRESHOLD = 100; // Start virtualizing after 100 messages

export function VirtualizedMessageList({
  messages,
  renderMessage,
  height,
  itemHeight = ITEM_HEIGHT,
  threshold = VIRTUALIZATION_THRESHOLD
}: VirtualizedMessageListProps) {
  // Only virtualize if we have many messages
  const shouldVirtualize = messages.length > threshold;

  const itemData = useMemo(() => ({
    messages,
    renderMessage,
  }), [messages, renderMessage]);

  const Row = useCallback(({ index, style, data }: any) => {
    const message = data.messages[index];
    return (
      <div style={style}>
        {data.renderMessage(message, index)}
      </div>
    );
  }, []);

  if (!shouldVirtualize) {
    // For smaller lists, render normally without virtualization
    return (
      <div className="flex flex-col space-y-4">
        {messages.map((message, index) => (
          <div key={message._id}>
            {renderMessage(message, index)}
          </div>
        ))}
      </div>
    );
  }

  // For large lists, use virtualization
  return (
    <List
      height={height}
      itemCount={messages.length}
      itemSize={itemHeight}
      itemData={itemData}
      width="100%"
    >
      {Row}
    </List>
  );
}