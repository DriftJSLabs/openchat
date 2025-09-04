"use client"

import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useQuery, useMutation } from 'convex/react'
import { api } from 'server/convex/_generated/api'
import type { Id } from 'server/convex/_generated/dataModel'
import ThoughtNode from '@/components/mindmap/thought-node'
import { ChatInput } from '@/components/chat-input'
import { useOpenRouterAuth } from '@/contexts/openrouter-auth'
import { Button } from '@/components/ui/button'
import { Plus, X, ZoomIn, ZoomOut, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const nodeTypes = {
  thought: ThoughtNode,
}

interface MindMapClientProps {
  chatId: string
}

function MindMapFlow({ chatId }: MindMapClientProps) {
  const { isConnected, token } = useOpenRouterAuth()
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [showInput, setShowInput] = useState(false)
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0 })
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedModel') || "openai/gpt-4o-mini"
    }
    return "openai/gpt-4o-mini"
  })
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // Convex queries and mutations
  const chat = useQuery(api.chats.getChat, { chatId: chatId as Id<"chats"> })
  const messages = useQuery(api.messages.getMessages, { chatId: chatId as Id<"chats"> })
  const sendMessage = useMutation(api.messages.sendMessage)
  const updateNodePosition = useMutation(api.messages.updateNodePosition)
  const updateViewport = useMutation(api.chats.updateViewport)
  
  // Create welcome node for new mindmaps
  useEffect(() => {
    if (messages && messages.length === 0 && nodes.length === 0) {
      // Create a welcome node
      const welcomeNode: Node = {
        id: 'welcome-node',
        type: 'thought',
        position: { x: window.innerWidth / 2 - 200, y: 200 },
        data: {
          content: "👋 Welcome to your mind map!\n\nClick the + button to add your first thought, or click the + below this message to branch from here.",
          role: 'assistant',
          timestamp: new Date(),
          nodeStyle: 'welcome',
          undeletable: true,
          onBranch: handleBranch,
        }
      }
      setNodes([welcomeNode])
    }
  }, [messages])
  
  // Convert messages to nodes and edges
  useEffect(() => {
    if (!messages || messages.length === 0) return
    
    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    
    // Create nodes from messages
    messages.forEach((message, index) => {
      const nodeId = message._id
      
      // Calculate position if not set
      const position = message.position || {
        x: 250 + (index % 3) * 300,
        y: 100 + Math.floor(index / 3) * 200
      }
      
      const node: Node = {
        id: nodeId,
        type: 'thought',
        position,
        data: {
          content: message.content,
          role: message.role,
          timestamp: new Date(message.createdAt),
          model: message.model,
          highlightedText: message.highlightedText,
          nodeStyle: message.nodeStyle,
          onBranch: handleBranch,
          onDelete: handleDelete,
        }
      }
      
      newNodes.push(node)
      
      // Create edge if parent exists
      if (message.parentMessageId) {
        const edge: Edge = {
          id: `${message.parentMessageId}-${nodeId}`,
          source: message.parentMessageId,
          target: nodeId,
          type: message.nodeStyle === 'branch' ? 'smoothstep' : 'default',
          animated: message.role === 'assistant',
          style: {
            stroke: 'hsl(var(--border) / 0.3)',
            strokeWidth: 2,
          }
        }
        newEdges.push(edge)
      }
    })
    
    setNodes(newNodes)
    setEdges(newEdges)
  }, [messages])
  
  // Save node position on drag end
  const handleNodeDragStop = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      // Don't save position for welcome node
      if (node.id === 'welcome-node') return
      
      try {
        await updateNodePosition({
          messageId: node.id as Id<"messages">,
          position: node.position
        })
      } catch (error) {
        console.error("Failed to update node position:", error)
        toast.error("Failed to save position")
      }
    },
    [updateNodePosition]
  )
  
  // Handle branch creation
  const handleBranch = useCallback((nodeId: string) => {
    setSelectedNode(nodeId === 'welcome-node' ? null : nodeId)
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      setInputPosition({
        x: node.position.x - 100,
        y: node.position.y + 150
      })
      setShowInput(true)
    }
  }, [nodes])
  
  // Handle node deletion
  const handleDelete = useCallback(async (nodeId: string) => {
    // Don't delete welcome node
    if (nodeId === 'welcome-node') {
      toast.error("This node cannot be deleted")
      return
    }
    console.log("Delete node:", nodeId)
  }, [])
  
  // Handle add new node button
  const handleAddNew = () => {
    // Get viewport center
    const flow = document.querySelector('.react-flow__viewport')
    if (flow) {
      const rect = flow.getBoundingClientRect()
      setInputPosition({ 
        x: rect.width / 2 - 300,
        y: 200
      })
    } else {
      setInputPosition({ x: 300, y: 200 })
    }
    setSelectedNode(null)
    setShowInput(true)
  }
  
  // Handle sending messages
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) {
      toast.error("Please enter a message")
      return
    }
    
    try {
      setIsLoading(true)
      setShowInput(false)
      
      // Calculate position for new node
      const position = inputPosition
      
      // Send user message
      const userMessageId = await sendMessage({
        chatId: chatId as Id<"chats">,
        content,
        role: "user",
        position,
        parentMessageId: selectedNode ? selectedNode as Id<"messages"> : undefined,
        highlightedText: undefined,
        nodeStyle: selectedNode ? "branch" : undefined
      })
      
      // Clear selection
      setSelectedNode(null)
      
      // Get AI response
      if (isConnected && token) {
        // Build context from parent chain
        const context = []
        if (selectedNode && messages) {
          // Find parent chain
          let currentId: string | null | undefined = selectedNode
          const visited = new Set<string>()
          
          while (currentId && !visited.has(currentId)) {
            visited.add(currentId)
            const msg = messages.find(m => m._id === currentId)
            if (msg) {
              context.unshift({
                role: msg.role,
                content: msg.content
              })
              currentId = msg.parentMessageId
            } else {
              break
            }
          }
        }
        
        // Add new user message
        context.push({ role: "user", content })
        
        // Stream AI response
        abortControllerRef.current = new AbortController()
        
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: context,
            model: selectedModel,
            token,
            streamId: crypto.randomUUID()
          }),
          signal: abortControllerRef.current.signal
        })
        
        if (!response.ok) throw new Error('Failed to get AI response')
        
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let aiContent = ''
        
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              
              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  aiContent += parsed.content
                  setStreamingContent(aiContent)
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
        
        // Save AI response
        if (aiContent) {
          await sendMessage({
            chatId: chatId as Id<"chats">,
            content: aiContent,
            role: "assistant",
            model: selectedModel,
            position: { 
              x: position.x, 
              y: position.y + 150 
            },
            parentMessageId: userMessageId as Id<"messages">,
            nodeStyle: selectedNode ? "branch" : undefined
          })
        }
        
        setStreamingContent("")
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      toast.error("Failed to send message")
      setShowInput(true) // Reopen input on error
    } finally {
      setIsLoading(false)
    }
  }
  
  // Handle viewport changes
  const handleViewportChange = useCallback(
    debounce(async (viewport: any) => {
      if (chat) {
        try {
          await updateViewport({
            chatId: chatId as Id<"chats">,
            viewport: {
              x: viewport.x,
              y: viewport.y,
              zoom: viewport.zoom
            }
          })
        } catch (error) {
          console.error("Failed to update viewport:", error)
        }
      }
    }, 500),
    [chat, chatId, updateViewport]
  )
  
  return (
    <div className="h-screen flex flex-col bg-background relative">
      {/* Floating controls in top-right */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => fitView({ duration: 300, padding: 0.2 })}
          title="Fit to view"
        >
          <Home className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => zoomIn({ duration: 200 })}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => zoomOut({ duration: 200 })}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Canvas */}
      <div className="flex-1 relative" ref={canvasRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onMove={(_: any, viewport: any) => handleViewportChange(viewport)}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          className="bg-background"
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={4}
          panOnScroll={true}

          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          translateExtent={[[-5000, -5000], [5000, 5000]]}
        >
          <Background 
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color="hsl(var(--border) / 0.15)"
            className="opacity-50"
          />
        </ReactFlow>
        
        {/* Floating input with X button */}
        {showInput && (
          <div 
            className="absolute z-50 animate-in fade-in-0 zoom-in-95 duration-200"
            style={{
              left: `${inputPosition.x}px`,
              top: `${inputPosition.y}px`,
              width: '600px',
            }}
          >
            <div className="relative bg-card border-2 border-border rounded-2xl shadow-2xl p-4">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-background border-2 border-border shadow-lg hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowInput(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <ChatInput 
                onSendMessage={(content) => handleSendMessage(content)}
                isLoading={isLoading}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </div>
          </div>
        )}
        
        {/* Floating add button */}
        <Button
          className={cn(
            "fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-2xl",
            "bg-primary hover:bg-primary/90 transition-all hover:scale-110",
            "border-2 border-background"
          )}
          onClick={handleAddNew}
          disabled={showInput || isLoading}
        >
          <Plus className="h-6 w-6" />
        </Button>
        
        {/* Streaming indicator */}
        {streamingContent && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 max-w-md p-4 bg-card border rounded-2xl shadow-lg animate-pulse">
            <p className="text-sm">{streamingContent}</p>
          </div>
        )}
        
        {/* Help text */}
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-2 rounded-lg">
          <span>Click and drag to move • Scroll to zoom • Space+drag to pan</span>
        </div>
      </div>
    </div>
  )
}

// Debounce helper
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export default function MindMapClient(props: MindMapClientProps) {
  return (
    <ReactFlowProvider>
      <MindMapFlow {...props} />
    </ReactFlowProvider>
  )
}