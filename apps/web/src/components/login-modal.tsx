'use client'

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth-client"

// Check if we're in development mode
const isDevelopment = () => {
  return process.env.NODE_ENV === 'development' || 
         process.env.NEXT_PUBLIC_DEV_MODE === 'true' ||
         window?.location?.hostname === 'localhost';
}

// Development auto-login function with enhanced error handling and user feedback
const handleDevLogin = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('🚀 Starting dev auto-login...');
    
    const response = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include'
    });
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
        if (errorJson.error) {
          console.error('🔍 Error details:', {
            error: errorJson.error,
            requestId: errorJson.requestId,
            details: errorJson.details,
            debug: errorJson.debug
          });
        }
      } catch (parseError) {
        console.error('Failed to parse error response:', errorText);
      }
      
      console.error('❌ Dev login HTTP error:', errorMessage);
      return { success: false, error: errorMessage };
    }
    
    const result = await response.json();
    console.log('📡 Dev login response received:', {
      success: result.success,
      requestId: result.requestId,
      duration: result.duration,
      hasUser: !!result.user
    });
    
    if (result.success && result.user) {
      console.log('✅ Dev login successful:', {
        userId: result.user.id,
        userEmail: result.user.email,
        userName: result.user.name,
        requestId: result.requestId,
        duration: result.duration
      });
      
      // Show success message before reloading
      console.log('🔄 Refreshing page to update authentication state...');
      
      // Small delay to allow console logging to complete
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
      return { success: true };
    } else {
      const errorMessage = result.message || 'Unknown error during dev login';
      console.error('❌ Dev login failed:', {
        message: errorMessage,
        error: result.error,
        requestId: result.requestId,
        details: result.details
      });
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error('❌ Dev login network/parsing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
    
    // Provide more specific error messages for common issues
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes('Failed to fetch')) {
      userFriendlyMessage = 'Cannot connect to server - is the development server running?';
    } else if (errorMessage.includes('NetworkError')) {
      userFriendlyMessage = 'Network error - check your connection and server status';
    } else if (errorMessage.includes('SyntaxError')) {
      userFriendlyMessage = 'Server response format error - check server logs';
    }
    
    return { success: false, error: userFriendlyMessage };
  }
}

interface LoginModalProps {
  triggerText?: string;
}

export default function LoginModal({ triggerText = "Log In" }: LoginModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isDevLoginLoading, setIsDevLoginLoading] = useState(false)
  const [devLoginError, setDevLoginError] = useState<string | null>(null)
  const [devLoginSuccess, setDevLoginSuccess] = useState(false)
  
  // Session detection - don't show login button if user is already logged in
  const { data: session, isPending } = authClient.useSession()
  
  // Don't render login button if user is already logged in
  if (session) {
    return null
  }

  // Enhanced dev login handler with UI state management
  const handleDevLoginClick = async () => {
    setIsDevLoginLoading(true)
    setDevLoginError(null)
    setDevLoginSuccess(false)

    try {
      const result = await handleDevLogin()
      
      if (result.success) {
        setDevLoginSuccess(true)
        // The handleDevLogin function will reload the page after a delay
      } else {
        setDevLoginError(result.error || 'Dev login failed')
      }
    } catch (error) {
      console.error('Unexpected error during dev login:', error)
      setDevLoginError('Unexpected error occurred')
    } finally {
      setIsDevLoginLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-sm">
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <motion.div
          key={isSignUp ? 'signup' : 'login'}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <DialogHeader>
            <DialogTitle>{isSignUp ? "Create account" : "Welcome back"}</DialogTitle>
            <DialogDescription>
              {isSignUp 
                ? "Create your OpenChat account to get started." 
                : "Sign in to your OpenChat account to continue."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {isSignUp && (
              <div className="grid gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder={isSignUp ? "Create a password" : "Enter your password"}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {isSignUp && (
              <div className="grid gap-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}
            <Button type="submit" className="w-full">
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>
            
            {/* Development-only auto-login section with enhanced UI feedback */}
            {typeof window !== 'undefined' && isDevelopment() && (
              <div className="border-t pt-4 mt-4 space-y-3">
                <Button 
                  type="button"
                  variant="secondary" 
                  className="w-full"
                  onClick={handleDevLoginClick}
                  disabled={isDevLoginLoading || devLoginSuccess}
                >
                  {isDevLoginLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                      <span>Logging in...</span>
                    </div>
                  ) : devLoginSuccess ? (
                    <div className="flex items-center gap-2">
                      <span>✅ Success! Refreshing...</span>
                    </div>
                  ) : (
                    <span>👨‍💻 Dev Auto-Login (Development Only)</span>
                  )}
                </Button>
                
                {/* Error message display */}
                {devLoginError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-red-500 text-sm">❌</span>
                      <div className="flex-1">
                        <p className="text-red-700 text-sm font-medium">Dev Login Failed</p>
                        <p className="text-red-600 text-xs mt-1">{devLoginError}</p>
                        <p className="text-red-500 text-xs mt-2">
                          Check the browser console for detailed error information.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success message display */}
                {devLoginSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-green-500 text-sm">✅</span>
                      <div>
                        <p className="text-green-700 text-sm font-medium">Login Successful!</p>
                        <p className="text-green-600 text-xs mt-1">Refreshing page to update authentication state...</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">
                    This button only appears in development mode
                  </p>
                  <details className="text-xs text-muted-foreground mt-2">
                    <summary className="cursor-pointer hover:text-foreground">
                      Troubleshooting
                    </summary>
                    <div className="mt-2 text-left space-y-1 bg-gray-50 p-2 rounded border text-xs">
                      <p>If dev login fails, try these solutions:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Ensure PostgreSQL is running: <code className="bg-gray-200 px-1 rounded">docker-compose up -d postgres</code></li>
                        <li>Run initialization script: <code className="bg-gray-200 px-1 rounded">bun run apps/server/scripts/initialize-dev-system.ts</code></li>
                        <li>Check server logs in the terminal</li>
                        <li>Verify DATABASE_URL environment variable</li>
                      </ul>
                    </div>
                  </details>
                </div>
              </div>
            )}
            
            <div className="text-center">
              <button 
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
              >
                {isSignUp 
                  ? "Already have an account? Sign in" 
                  : "Don't have an account? Sign up"
                }
              </button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}