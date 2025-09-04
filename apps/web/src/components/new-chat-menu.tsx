"use client"

import { useMutation } from "convex/react"
import { api } from "../../../server/convex/_generated/api"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Sparkles } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
      toast.error("Please sign in", {
        description: "You need to be signed in to create a new chat."
      })
      return
    }
    
    try {
      const id = await createChat({ viewMode })
      router.push(`/chat/${id}`)
      onChatCreated?.()
    } catch (error) {
      toast.error("Failed to create chat", {
        description: "There was an error creating your chat. Please try again."
      })
    }
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          className={className || "w-full justify-start gap-2"}
          variant="default"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem 
          onClick={() => handleCreateChat("chat")}
          className="gap-2 cursor-pointer"
        >
          <MessageSquare className="h-4 w-4" />
          Regular Chat
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleCreateChat("mindmap")}
          className="gap-2 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-purple-500" />
          Mindmap Chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}