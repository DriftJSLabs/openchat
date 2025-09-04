"use client"

import React, { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { MessageContent } from '@/components/message-content'
import { Button } from '@/components/ui/button'
import { User, Bot, Plus } from 'lucide-react'

export interface ThoughtNodeData {
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: Date
  model?: string
  highlightedText?: string
  nodeStyle?: string
  undeletable?: boolean
  onBranch?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
}

const ThoughtNode = memo(({ data, id, selected }: NodeProps<ThoughtNodeData>) => {
  const [isHovered, setIsHovered] = useState(false)
  const isUser = data.role === 'user'
  
  return (
    <>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-border !w-2 !h-2 !border-0 opacity-50"
      />
      
      <div 
        className={cn(
          "group relative min-w-[250px] max-w-[400px] rounded-2xl border bg-card p-4 shadow-lg transition-all",
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          data.nodeStyle === "welcome" && "border-primary/30 bg-primary/5",
          data.nodeStyle === "branch" && "border-purple-500/30 bg-purple-500/5",
          data.nodeStyle === "synthesis" && "border-amber-500/30 bg-amber-500/5",
          data.role === 'user' ? "border-blue-500/30 bg-blue-500/5" : 
          data.role === 'system' ? "border-primary/30 bg-primary/5" :
          "border-green-500/30 bg-green-500/5"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center",
              isUser ? "bg-blue-500/10" : "bg-green-500/10"
            )}>
              {isUser ? (
                <User className="h-3 w-3 text-blue-500" />
              ) : (
                <Bot className="h-3 w-3 text-green-500" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {isUser ? 'You' : data.model || 'Assistant'}
            </span>
          </div>
        </div>
        
        {/* Branch button - appears on hover */}
        {isHovered && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
            onClick={(e) => {
              e.stopPropagation()
              data.onBranch?.(id)
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
        
        {/* Highlighted context if any */}
        {data.highlightedText && (
          <div className="mb-2 p-2 rounded bg-muted/50 border-l-2 border-primary">
            <p className="text-xs text-muted-foreground mb-1">Context:</p>
            <p className="text-xs italic">"{data.highlightedText}"</p>
          </div>
        )}
        
        {/* Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MessageContent 
            content={data.content}
          />
        </div>
        
        {/* Timestamp */}
        <div className="mt-3 text-xs text-muted-foreground">
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-border !w-2 !h-2 !border-0 opacity-50"
      />
    </>
  )
})

ThoughtNode.displayName = 'ThoughtNode'

export default ThoughtNode