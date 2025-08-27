'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStream } from '@/hooks/use-chat-stream'

interface NewChatButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  children?: React.ReactNode
}

export function NewChatButton({ 
  variant = 'default', 
  size = 'default', 
  className,
  children
}: NewChatButtonProps) {
  const [isCreating, setIsCreating] = useState(false)
  const router = useRouter()
  const { createChat } = useChatStream({})

  const handleNewChat = async () => {
    if (isCreating) return

    setIsCreating(true)

    try {
      // Generate a unique title with timestamp for better UX
      const timestamp = new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit' 
      })
      const title = `Chat ${timestamp}`
      
      // Create new chat using the hook
      const newChat = await createChat(title)
      
      if (newChat) {
        // Redirect to the new chat page
        router.push(`/chat/${newChat.id}`)
      } else {
        console.error('Failed to create new chat')
      }
    } catch (error) {
      console.error('Error creating new chat:', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleNewChat}
      disabled={isCreating}
    >
      {isCreating ? (
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
          <span>Creating...</span>
        </div>
      ) : (
        <>
          <Plus className="h-4 w-4" />
          {children || <span className="ml-2">New Chat</span>}
        </>
      )}
    </Button>
  )
}