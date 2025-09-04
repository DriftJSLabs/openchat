"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ModelSwitcher } from "./model-switcher"
import { Search, Paperclip, ArrowUp, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface ChatInputProps {
  onSendMessage?: (content: string, model: string) => void
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (e: React.FormEvent) => void
  onStop?: () => void
  isLoading?: boolean
  isConnected?: boolean
  selectedModel?: string
  onModelChange?: (model: string) => void
}

export function ChatInput({
  onSendMessage,
  value: externalValue,
  onChange: externalOnChange,
  onSubmit: externalOnSubmit,
  onStop,
  isLoading = false,
  isConnected = true,
  selectedModel: externalSelectedModel,
  onModelChange: externalOnModelChange,
}: ChatInputProps = {}) {
  const [message, setMessage] = useState(externalValue || "")
  const [selectedModel, setSelectedModel] = useState(externalSelectedModel || "openai/gpt-4o")
  const [searchActive, setSearchActive] = useState(false)
  const [attachActive, setAttachActive] = useState(false)

  useEffect(() => {
    if (externalValue !== undefined) {
      setMessage(externalValue)
    }
  }, [externalValue])

  useEffect(() => {
    if (externalSelectedModel !== undefined) {
      setSelectedModel(externalSelectedModel)
    }
  }, [externalSelectedModel])

  const handleMessageChange = (value: string) => {
    setMessage(value)
    externalOnChange?.(value)
  }

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    externalOnModelChange?.(model)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const messageToSend = externalValue !== undefined ? externalValue : message
    if (messageToSend.trim() && !isLoading) {
      if (externalOnSubmit) {
        externalOnSubmit(e)
        // Don't clear here, let parent handle it
      } else if (onSendMessage) {
        onSendMessage(messageToSend, selectedModel)
        setMessage("")
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const messageToSend = externalValue !== undefined ? externalValue : message
      if (messageToSend.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto pb-0">
      <form onSubmit={handleSubmit}>
        <div className="bg-background/95 backdrop-blur-xl border-t border-l border-r border-border rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
          {/* Text Input Area */}
          <div className="relative px-5 py-4 cursor-text border-b border-border/50" onClick={() => document.getElementById("message-input")?.focus()}>
            <textarea
              id="message-input"
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/60 resize-none border-none outline-none text-base leading-relaxed min-h-[60px] max-h-[200px] pr-12"
              rows={3}
              disabled={isLoading}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = "auto"
                target.style.height = Math.min(target.scrollHeight, 200) + "px"
              }}
            />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              <ModelSwitcher 
                selectedModel={selectedModel} 
                onModelChange={handleModelChange}
                compact={false}
              />
              
              <div className="h-6 w-px bg-border/30" />
              
              <Button 
                type="button"
                variant="outline"
                size="sm" 
                onClick={() => setSearchActive(!searchActive)}
                className={cn(
                  "h-9 px-3 rounded-lg transition-all border-border/50",
                  searchActive 
                    ? "bg-primary/10 text-primary border-primary/50 hover:bg-primary/20" 
                    : "hover:bg-accent hover:border-border"
                )}
              >
                <Search className="h-4 w-4" />
                <span className="ml-2 text-sm font-medium">Search</span>
              </Button>
              
              <Button 
                type="button"
                variant="outline"
                size="sm" 
                onClick={() => setAttachActive(!attachActive)}
                className={cn(
                  "h-9 px-3 rounded-lg transition-all border-border/50",
                  attachActive 
                    ? "bg-primary/10 text-primary border-primary/50 hover:bg-primary/20" 
                    : "hover:bg-accent hover:border-border"
                )}
              >
                <Paperclip className="h-4 w-4" />
                <span className="ml-2 text-sm font-medium">Attach</span>
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    type="button"
                    size="icon"
                    onClick={onStop}
                    className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!(externalValue !== undefined ? externalValue : message).trim()}
                    className={cn(
                      "h-9 w-9 rounded-full transition-all",
                      (externalValue !== undefined ? externalValue : message).trim()
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                        : "bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  )
}