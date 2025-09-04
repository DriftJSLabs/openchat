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
  Controls,
  MiniMap,
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
        // Silently handle position update errors
      }
    },
    [updateNodePosition]
  )
  
  // Handle branch creation from a node
  const handleBranch = useCallback(async (parentId: string, highlightedText?: string) => {
    if (!chat) return
    
    // Create a new message as a reply to the parent
    await sendMessage({
      chatId: chat._id,
      content: highlightedText || "New thought",
      role: "user",
      parentMessageId: parentId as Id<"messages">,
      highlightedText,
    })
  }, [chat, sendMessage])
  
  // Handle node deletion
  const handleDelete = useCallback(async (nodeId: string) => {
    // For now, we don't support deletion
    // This could be implemented later
  }, [])
  
  return (
    <div className="flex-1 h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}

export default function MindMapClient({ chatId }: MindMapClientProps) {
  return (
    <ReactFlowProvider>
      <MindMapFlow chatId={chatId} />
    </ReactFlowProvider>
  )
}