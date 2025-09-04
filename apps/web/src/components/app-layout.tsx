"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Menu, X, LogOut, Pencil, Check, AlertTriangle, Info, Sparkles, Unlink, ExternalLink, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../server/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useOpenRouterAuth } from "@/contexts/openrouter-auth";
import { toast } from "sonner";
import { SignInForm, SignUpForm } from "@/components/auth-forms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<{ id: any; title: string } | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [deletedChats, setDeletedChats] = useState<Set<string>>(new Set());
  const [animatedChats, setAnimatedChats] = useState<Set<string>>(new Set());
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [signInMode, setSignInMode] = useState(true);
  
  const createChat = useMutation(api.chats.createChat);
  const deleteChat = useMutation(api.chats.deleteChat);
  const updateChat = useMutation(api.chats.updateChat);
  const chats = useQuery(api.chats.getChats);
  
  const { isAuthenticated, isLoading: isAuthLoading, signOut } = useAuth();
  const { isConnected: isOpenRouterConnected, connectOpenRouter, disconnect: disconnectOpenRouter } = useOpenRouterAuth();

  // Track which chats have been animated
  React.useEffect(() => {
    if (chats && chats.length > 0) {
      // Add new chats to animated set after animation completes
      const newChats = chats.filter(chat => !animatedChats.has(chat._id));
      if (newChats.length > 0) {
        setTimeout(() => {
          setAnimatedChats(prev => {
            const next = new Set(prev);
            newChats.forEach(chat => next.add(chat._id));
            return next;
          });
        }, 200 + (newChats.length * 40)); // Wait for all animations to complete
      }
    }
  }, [chats]);

  const handleNewChat = async () => {
    if (!isAuthenticated) {
      // Don't show toast, just show the sign-in form
      return;
    }
    
    try {
      const chatId = await createChat({ title: "New Chat" });
      router.push(`/chat/${chatId}`);
    } catch (error) {
      // Silent fail or show a simple error
    }
  };

  const performDelete = () => {
    if (!chatToDelete) return;
    
    const chatId = chatToDelete.id;
    
    // Immediately hide the chat from UI
    setDeletedChats(prev => new Set(prev).add(chatId));
    setDeleteDialogOpen(false);
    setChatToDelete(null);
    
    if (pathname === `/chat/${chatId}`) {
      router.push("/");
    }
    
    // Fire delete in background
    deleteChat({ chatId: chatId as any }).catch(error => {
      // Remove from deleted set if failed
      setDeletedChats(prev => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
    });
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: any, chatTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.shiftKey) {
      // For shift+click, delete immediately without dialog
      setDeletedChats(prev => new Set(prev).add(chatId));
      
      if (pathname === `/chat/${chatId}`) {
        router.push("/");
      }
      
      deleteChat({ chatId }).catch(error => {
        setDeletedChats(prev => {
          const next = new Set(prev);
          next.delete(chatId);
          return next;
        });
      });
    } else {
      // Show confirmation dialog
      setChatToDelete({ id: chatId, title: chatTitle });
      setDeleteDialogOpen(true);
    }
  };

  const handleEditChat = (e: React.MouseEvent, chatId: string, currentTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingChat(chatId);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async (e: React.MouseEvent | React.KeyboardEvent, chatId: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (editTitle.trim() && editTitle !== chats?.find(c => c._id === chatId)?.title) {
      try {
        await updateChat({ chatId, title: editTitle.trim() });
      } catch (error) {
        }
    }
    
    setEditingChat(null);
    setEditTitle("");
  };

  const handleCancelEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const chat = chats?.find(c => c._id === editingChat);
    if (chat) {
      setEditTitle(chat.title); // Reset to original title
    }
    setEditingChat(null);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully", {
        description: "You have been signed out of your account."
      });
      router.push("/");
    } catch (error) {
      toast.error("Sign-out failed", {
        description: "There was an issue signing out. Please try again."
      });
    }
  };

  const renderChatItem = (chat: any, index: number) => {
    const isEditing = editingChat === chat._id;
    const isActive = pathname === `/chat/${chat._id}`;
    const shouldAnimate = !animatedChats.has(chat._id) && !isEditing;
    
    if (isEditing) {
      return (
        <div
          key={chat._id}
          data-chat-id={chat._id}
          className={cn(
            "flex items-center gap-1 px-2 text-sm",
            "bg-sidebar-accent/40 transition-colors duration-150"
          )}
        >
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveEdit(e, chat._id);
              } else if (e.key === 'Escape') {
                handleCancelEdit(e);
              }
            }}
            className="flex-1 min-w-0 bg-transparent text-sidebar-accent-foreground border-b border-sidebar-accent-foreground/50 outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-green-500/20 hover:text-green-400"
              onClick={(e) => handleSaveEdit(e, chat._id)}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400"
              onClick={handleCancelEdit}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    }
    
    return (
      <Link
        key={chat._id}
        href={`/chat/${chat._id}`}
        onClick={() => setSidebarOpen(false)}
        data-chat-id={chat._id}
        className={cn(
          "chat-item group flex items-center gap-1 px-2 text-sm transition-all duration-150 hover:bg-sidebar-accent/30",
          isActive && "bg-sidebar-accent/40 font-medium",
          shouldAnimate && "chat-item-enter"
        )}
        style={{ animationDelay: shouldAnimate ? `${index * 40}ms` : '0ms' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {chat.viewMode === "mindmap" && (
            <Sparkles className="h-3 w-3 text-purple-500 flex-shrink-0" />
          )}
          <span className="truncate font-medium">{chat.title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 hover:bg-primary/20 hover:text-primary transition-opacity duration-150",
              "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => handleEditChat(e, chat._id, chat.title)}
            title="Edit chat title"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 hover:bg-red-500/20 hover:text-red-400 transition-opacity duration-150",
              "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => handleDeleteChat(e, chat._id, chat.title)}
            title="Delete chat (hold Shift to skip confirmation)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <style jsx global>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideOutUp {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
        }
        
        @keyframes dialogSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -48%) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        
        .chat-item-enter {
          opacity: 0;
          animation: slideInDown 0.2s ease-out forwards;
        }
        
        .dialog-content {
          animation: none;
        }
      `}</style>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] dialog-content border-border bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Chat
            </DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{chatToDelete?.title}"</span>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
              <Info className="h-5 w-5 text-primary" />
              About OpenChat
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
                BETA
              </span>
              <span className="text-sm text-muted-foreground">This is a beta version</span>
            </div>
            
            <p className="text-sm leading-relaxed text-muted-foreground">
              OpenChat is currently in beta. You may encounter bugs or unexpected behavior. We're actively working on improvements and appreciate your feedback.
            </p>
            
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-2">🐛 Found a bug?</p>
              <p className="text-sm text-muted-foreground mb-3">
                Help us improve by reporting issues on GitHub
              </p>
              <a
                href="https://github.com/DriftJSLabs/openchat/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Report an issue
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInfoDialogOpen(false)}
              className="hover:bg-muted"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-out lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="navigation"
        aria-label="Mobile chat navigation"
      >
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden hover:bg-white/10 absolute left-4"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close navigation sidebar</span>
            </Button>
            <Link href="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 mx-auto">
              <span className="text-xl font-bold text-white tracking-tight">
                OpenChat
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                BETA
              </span>
            </Link>
          </div>

          {/* New Chat Button or Auth Form */}
          {isAuthenticated ? (
            <div className="p-4">
              <Button
                onClick={handleNewChat}
                className="w-full justify-center gap-2 transition-all duration-150 hover:scale-105 active:scale-95"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            </div>
          ) : (
            // Sign In/Up Form when not authenticated
            <div className="p-4 space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-semibold">Welcome to OpenChat</h2>
                <p className="text-sm text-muted-foreground mt-1">Sign in to start chatting</p>
              </div>
              
              {signInMode ? (
                <>
                  <SignInForm onSuccess={() => setSidebarOpen(false)} />
                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">Don't have an account? </span>
                    <button
                      onClick={() => setSignInMode(false)}
                      className="text-primary hover:underline"
                    >
                      Sign up
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <SignUpForm onSuccess={() => setSidebarOpen(false)} />
                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">Already have an account? </span>
                    <button
                      onClick={() => setSignInMode(true)}
                      className="text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Chats List */}
          {isAuthenticated && (
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Recent Chats
              </h3>
              <div className="space-y-1">
                {isAuthLoading ? (
                  // Loading state
                  <>
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                  </>
                ) : chats === undefined ? (
                  // Still loading from Convex
                  <>
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                  </>
                ) : chats.filter(chat => !deletedChats.has(chat._id)).length === 0 ? (
                  // Empty state
                  <div className="text-center py-8">
                    <p className="text-xs text-sidebar-foreground/40 mb-2">No conversations yet</p>
                    <p className="text-xs text-sidebar-foreground/30">Click "New Chat" to start</p>
                  </div>
                ) : (
                  // Chat list
                  chats.filter(chat => !deletedChats.has(chat._id)).map((chat, index) => renderChatItem(chat, index))
                )}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          {isAuthenticated && (
            <div className="border-t border-sidebar-border p-4 space-y-2">
              {/* OpenRouter Connection */}
              {!isOpenRouterConnected ? (
                <Button
                  onClick={connectOpenRouter}
                  className="w-full justify-start gap-2"
                  variant="ghost"
                >
                  <ExternalLink className="h-4 w-4" />
                  Connect OpenRouter
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    disconnectOpenRouter();
                    toast.success("Disconnected from OpenRouter");
                  }}
                  className="w-full justify-start gap-2"
                  variant="ghost"
                >
                  <Unlink className="h-4 w-4" />
                  Disconnect OpenRouter
                </Button>
              )}
              <Button
                onClick={handleSignOut}
                className="w-full justify-start gap-2"
                variant="ghost"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-sidebar lg:border-r lg:border-sidebar-border" role="navigation" aria-label="Desktop chat navigation">
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
            <Link href="/" className="flex items-center gap-2 mx-auto">
              <span className="text-xl font-bold text-white tracking-tight">
                OpenChat
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                BETA
              </span>
            </Link>
          </div>

          {/* New Chat Button or Auth Form */}
          {isAuthenticated ? (
            <div className="p-4">
              <Button
                onClick={handleNewChat}
                className="w-full justify-center gap-2 transition-all duration-150 hover:scale-105 active:scale-95"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            </div>
          ) : (
            // Sign In/Up Form when not authenticated
            <div className="p-4 space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-semibold">Welcome to OpenChat</h2>
                <p className="text-sm text-muted-foreground mt-1">Sign in to start chatting</p>
              </div>
              
              {signInMode ? (
                <>
                  <SignInForm onSuccess={() => setSidebarOpen(false)} />
                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">Don't have an account? </span>
                    <button
                      onClick={() => setSignInMode(false)}
                      className="text-primary hover:underline"
                    >
                      Sign up
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <SignUpForm onSuccess={() => setSidebarOpen(false)} />
                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">Already have an account? </span>
                    <button
                      onClick={() => setSignInMode(true)}
                      className="text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Chats List */}
          {isAuthenticated && (
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Recent Chats
              </h3>
              <div className="space-y-1">
                {isAuthLoading ? (
                  // Loading state
                  <>
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                  </>
                ) : chats === undefined ? (
                  // Still loading from Convex
                  <>
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                    <div className="h-8 bg-sidebar-accent/20 rounded-lg animate-pulse" />
                  </>
                ) : chats.filter(chat => !deletedChats.has(chat._id)).length === 0 ? (
                  // Empty state
                  <div className="text-center py-8">
                    <p className="text-xs text-sidebar-foreground/40 mb-2">No conversations yet</p>
                    <p className="text-xs text-sidebar-foreground/30">Click "New Chat" to start</p>
                  </div>
                ) : (
                  // Chat list
                  chats.filter(chat => !deletedChats.has(chat._id)).map((chat, index) => renderChatItem(chat, index))
                )}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          {isAuthenticated && (
            <div className="border-t border-sidebar-border p-4 space-y-2">
              {/* OpenRouter Connection */}
              {!isOpenRouterConnected ? (
                <Button
                  onClick={connectOpenRouter}
                  className="w-full justify-start gap-2"
                  variant="ghost"
                >
                  <ExternalLink className="h-4 w-4" />
                  Connect OpenRouter
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    disconnectOpenRouter();
                    toast.success("Disconnected from OpenRouter");
                  }}
                  className="w-full justify-start gap-2"
                  variant="ghost"
                >
                  <Unlink className="h-4 w-4" />
                  Disconnect OpenRouter
                </Button>
              )}
              <Button
                onClick={handleSignOut}
                className="w-full justify-start gap-2"
                variant="ghost"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation sidebar</span>
          </Button>
          <div className="flex-1" />
          <ModeToggle />
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center justify-end gap-4 border-b border-border bg-background px-6">
          <Button
              variant="outline"
              size="icon"
              onClick={() => setInfoDialogOpen(true)}
              className="h-9 w-9"
          >
            <Info className="h-4 w-4" />
          </Button>
          <ModeToggle />
        </header>

        {/* Page Content */}
        <main className="flex flex-col h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
}