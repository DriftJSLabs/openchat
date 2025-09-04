"use client"

import { useState, useRef } from "react"
import { Plus, MessageCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMutation } from "convex/react"
import { api } from "../../../server/convex/_generated/api"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface NewChatMenuProps {
  onChatCreated?: () => void
  className?: string
  isAuthenticated?: boolean
}

export function NewChatMenu({ onChatCreated, className, isAuthenticated = true }: NewChatMenuProps) {
  const [showOptions, setShowOptions] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const createChat = useMutation(api.chats.createChat)
  const router = useRouter()

  const handleCreateChat = async (viewMode: "chat" | "mindmap") => {
    if (!isAuthenticated) {
      toast.info("Please sign in to start chatting", {
        description: "You need to create an account to use OpenChat"
      })
      router.push("/sign-in")
      return
    }
    
    try {
      const id = await createChat({ viewMode })
      router.push(`/chat/${id}`)
      onChatCreated?.()
      setShowOptions(false)
    } catch (error) {
      console.error("Failed to create chat:", error)
    }
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setShowOptions(true)
    }, 700) // Show after 700ms of hovering
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShowOptions(false)
  }

  return (
    <div 
      className="relative w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        variant="outline"
        className={cn("w-full justify-center gap-2 transition-all duration-150 hover:scale-105 active:scale-95", className)}
        onClick={() => handleCreateChat("chat")}
      >
        <Plus className="h-4 w-4" />
        New Chat
      </Button>

      {showOptions && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-lg border bg-sidebar p-1 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
          <button
            onClick={() => handleCreateChat("chat")}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <MessageCircle className="h-4 w-4 flex-shrink-0" />
            <div className="text-left flex-1">
              <div className="font-medium">Normal Chat</div>
              <div className="text-xs text-sidebar-foreground/60">Traditional conversation</div>
            </div>
          </button>
          <button
            onClick={() => handleCreateChat("mindmap")}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <div className="text-left flex-1">
              <div className="font-medium">Canvas Chat</div>
              <div className="text-xs text-sidebar-foreground/60">Visual mind map</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}