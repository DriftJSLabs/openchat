"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "server/convex/_generated/api";
import type { Id } from "server/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import ChatPageClient from "./chat-client-v2";
import MindMapClient from "./mindmap-client";
import { ChatErrorBoundary } from "@/components/error-boundary";

export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;
  
  const chat = useQuery(api.chats.getChat, { 
    chatId: chatId as Id<"chats"> 
  });
  
  // Show error if chat fetch fails
  useEffect(() => {
    if (chat === null) {
      toast.error("Failed to load chat", {
        description: "Please check your connection and try again"
      });
    }
  }, [chat]);
  
  // Loading state
  if (chat === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading chat...</div>
      </div>
    );
  }
  
  // Error state
  if (chat === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Chat not found</h2>
          <p className="text-muted-foreground">This chat may have been deleted or you don't have access to it.</p>
        </div>
      </div>
    );
  }
  
  // Render appropriate view based on chat mode
  if (chat.viewMode === "mindmap") {
    return (
      <ChatErrorBoundary chatId={chatId}>
        <MindMapClient chatId={chatId} />
      </ChatErrorBoundary>
    );
  }
  
  return (
    <ChatErrorBoundary chatId={chatId}>
      <ChatPageClient chatId={chatId} />
    </ChatErrorBoundary>
  );
}