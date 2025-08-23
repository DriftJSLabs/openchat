/**
 * Enhanced chat example component demonstrating integration with the new AI API
 * Shows how to use the enhanced streaming API with proper error handling
 */

'use client'

import { useState } from 'react'
import { useChat } from 'ai/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MessageSquare, Send, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react'

interface EnhancedChatExampleProps {
  /** Optional chat ID for existing conversations */
  chatId?: string
  /** Optional user ID for authenticated requests */
  userId?: string
  /** Optional preferred AI model */
  preferredModel?: string
  /** Whether to show debug information */
  showDebugInfo?: boolean
}

export function EnhancedChatExample({
  chatId,
  userId,
  preferredModel,
  showDebugInfo = false,
}: EnhancedChatExampleProps) {
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [debugInfo, setDebugInfo] = useState<{
    requestId?: string
    modelUsed?: string
    responseTime?: string
    userContext?: any
  }>({})

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    reload,
    stop,
  } = useChat({
    api: '/api/chat',
    body: {
      chatId,
      userId,
      model: preferredModel,
      temperature,
      maxTokens,
    },
    onResponse: (response) => {
      // Extract debug information from response headers
      if (showDebugInfo) {
        setDebugInfo({
          requestId: response.headers.get('X-Request-ID') || undefined,
          modelUsed: response.headers.get('X-Model-Used') || undefined,
          responseTime: response.headers.get('X-Response-Time') || undefined,
          userContext: {
            userId: response.headers.get('X-User-ID'),
            email: response.headers.get('X-User-Email'),
            verified: response.headers.get('X-User-Verified') === 'true',
          },
        })
      }
    },
    onError: (error) => {
      console.error('[Enhanced Chat] Error occurred:', error)
      
      // Parse error response for enhanced error handling
      try {
        const errorData = JSON.parse(error.message)
        if (errorData.error?.retryable) {
          console.log('[Enhanced Chat] Error is retryable, consider showing retry option')
        }
      } catch (e) {
        // Error message is not JSON, use as-is
      }
    },
  })

  return (
    <div className=\"space-y-6\">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className=\"flex items-center gap-2\">
            <Zap className=\"h-5 w-5\" />
            Enhanced AI Chat Configuration
          </CardTitle>
          <CardDescription>
            Configure AI parameters and view connection status
          </CardDescription>
        </CardHeader>
        <CardContent className=\"space-y-4\">
          <div className=\"grid grid-cols-1 md:grid-cols-2 gap-4\">
            <div className=\"space-y-2\">
              <label className=\"text-sm font-medium\">Temperature ({temperature})</label>
              <input
                type=\"range\"
                min=\"0\"
                max=\"2\"
                step=\"0.1\"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className=\"w-full\"
              />
              <p className=\"text-xs text-muted-foreground\">
                Controls randomness: 0 = deterministic, 2 = very creative
              </p>
            </div>
            
            <div className=\"space-y-2\">
              <label className=\"text-sm font-medium\">Max Tokens ({maxTokens})</label>
              <input
                type=\"range\"
                min=\"256\"
                max=\"8192\"
                step=\"256\"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className=\"w-full\"
              />
              <p className=\"text-xs text-muted-foreground\">
                Maximum response length
              </p>
            </div>
          </div>
          
          {/* Status Indicators */}
          <div className=\"flex gap-2 flex-wrap\">
            <Badge variant={isLoading ? \"default\" : \"secondary\"} className=\"flex items-center gap-1\">
              {isLoading ? (
                <>
                  <Clock className=\"h-3 w-3 animate-spin\" />
                  Generating
                </>
              ) : (
                <>
                  <CheckCircle className=\"h-3 w-3\" />
                  Ready
                </>
              )}
            </Badge>
            
            {preferredModel && (
              <Badge variant=\"outline\">
                Model: {preferredModel}
              </Badge>
            )}
            
            {userId && (
              <Badge variant=\"outline\">
                Authenticated
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Debug Information */}
      {showDebugInfo && Object.keys(debugInfo).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className=\"text-sm\">Debug Information</CardTitle>
          </CardHeader>
          <CardContent className=\"space-y-2 text-xs font-mono\">
            {debugInfo.requestId && (
              <div>Request ID: {debugInfo.requestId}</div>
            )}
            {debugInfo.modelUsed && (
              <div>Model Used: {debugInfo.modelUsed}</div>
            )}
            {debugInfo.responseTime && (
              <div>Response Time: {debugInfo.responseTime}ms</div>
            )}
            {debugInfo.userContext?.userId && (
              <div className=\"space-y-1\">
                <div>User: {debugInfo.userContext.userId}</div>
                <div>Email: {debugInfo.userContext.email}</div>
                <div>Verified: {debugInfo.userContext.verified ? 'Yes' : 'No'}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant=\"destructive\">
          <AlertCircle className=\"h-4 w-4\" />
          <AlertDescription className=\"flex items-center justify-between\">
            <span>{error.message}</span>
            <Button size=\"sm\" variant=\"outline\" onClick={() => reload()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Chat Interface */}
      <Card className=\"h-[500px] flex flex-col\">
        <CardHeader>
          <CardTitle className=\"flex items-center gap-2\">
            <MessageSquare className=\"h-5 w-5\" />
            Enhanced AI Chat
          </CardTitle>
          <CardDescription>
            Powered by OpenRouter with model fallbacks and enhanced error handling
          </CardDescription>
        </CardHeader>
        
        <CardContent className=\"flex-1 flex flex-col space-y-4\">
          {/* Messages */}
          <div className=\"flex-1 overflow-y-auto space-y-4 border rounded-lg p-4\">
            {messages.length === 0 ? (
              <div className=\"text-center text-muted-foreground\">
                Start a conversation with the enhanced AI chat system
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className=\"flex items-start gap-2\">
                      <div className=\"flex-1\">
                        <Badge 
                          variant={message.role === 'user' ? 'secondary' : 'outline'}
                          className=\"text-xs mb-2\"
                        >
                          {message.role}
                        </Badge>
                        <p className=\"text-sm whitespace-pre-wrap\">
                          {message.content}
                        </p>
                        {message.createdAt && (
                          <p className=\"text-xs opacity-70 mt-1\">
                            {new Date(message.createdAt).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {/* Loading indicator */}
            {isLoading && (
              <div className=\"flex justify-start\">
                <div className=\"bg-muted rounded-lg p-3 flex items-center gap-2\">
                  <Clock className=\"h-4 w-4 animate-spin\" />
                  <span className=\"text-sm\">AI is thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className=\"flex gap-2\">
            <Textarea
              value={input}
              onChange={handleInputChange}
              placeholder=\"Type your message... (Shift+Enter for new line)\"
              disabled={isLoading}
              className=\"flex-1 min-h-[60px] resize-none\"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <div className=\"flex flex-col gap-2\">
              <Button
                type=\"submit\"
                disabled={isLoading || !input.trim()}
                className=\"px-3\"
              >
                <Send className=\"h-4 w-4\" />
              </Button>
              {isLoading && (
                <Button
                  type=\"button\"
                  variant=\"outline\"
                  onClick={stop}
                  className=\"px-3\"
                >
                  Stop
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}