"use client"

import { useMutation } from "convex/react"
import { api } from "../../../server/convex/_generated/api"
import { useRouter } from "next/navigation"

interface NewChatMenuProps {
  onChatCreated?: () => void
  className?: string
  isAuthenticated?: boolean
}

export function NewChatMenu({ onChatCreated, className, isAuthenticated = true }: NewChatMenuProps) {
  const createChat = useMutation(api.chats.createChat)
  const router = useRouter()

  const handleCreateChat = async (viewMode: "chat" | "mindmap") => {
    if (!isAuthenticated) {
      // User not authenticated
      return
    }
    
    try {
      const id = await createChat({ viewMode })
      router.push(`/chat/${id}`)
      onChatCreated?.()
    } catch (error) {
      // Silently handle errors
    }
  }
  
  return (
    <button
      onClick={() => handleCreateChat("chat")}
      className={className}
    >
      New Chat
    </button>
  )
}