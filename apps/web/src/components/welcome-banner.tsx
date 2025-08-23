/**
 * Welcome Banner Component
 * 
 * Displays contextual welcome messages and information for users,
 * adapting to different user states and providing helpful guidance.
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, MessageSquare, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WelcomeBannerProps {
  className?: string;
  variant?: 'default' | 'compact' | 'minimal';
  showDismiss?: boolean;
  onDismiss?: () => void;
}

/**
 * Welcome banner component with dynamic content based on user state
 * 
 * @param className - Additional CSS classes
 * @param variant - Display variant
 * @param showDismiss - Whether to show dismiss button
 * @param onDismiss - Callback when banner is dismissed
 */
export function WelcomeBanner({
  className,
  variant = 'default',
  showDismiss = true,
  onDismiss,
}: WelcomeBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [currentTip, setCurrentTip] = useState(0);

  // Rotate tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  if (variant === 'minimal') {
    return (
      <div className={cn(
        "px-4 py-2 bg-primary/5 border-b border-primary/10",
        className
      )}>
        <p className="text-sm text-center text-muted-foreground">
          <Sparkles className="inline h-4 w-4 mr-1" />
          Start a conversation with AI
        </p>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn(
        "px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b",
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">Welcome to OpenChat</span>
          </div>
          {showDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative overflow-hidden bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-b",
      className
    )}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-4 left-4 w-8 h-8 border border-primary/20 rounded-full" />
        <div className="absolute top-8 right-12 w-4 h-4 bg-primary/20 rounded-full" />
        <div className="absolute bottom-6 left-1/3 w-6 h-6 border border-primary/20 rounded" />
      </div>

      <div className="relative px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            {/* Welcome Content */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Welcome to OpenChat
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Your AI-powered conversation companion
                  </p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <FeatureCard
                  icon={MessageSquare}
                  title="Smart Conversations"
                  description="Engage in natural, context-aware dialogue"
                />
                <FeatureCard
                  icon={Zap}
                  title="Instant Responses"
                  description="Get quick, helpful answers to your questions"
                />
                <FeatureCard
                  icon={Users}
                  title="Personalized Experience"
                  description="Conversations tailored to your needs"
                />
              </div>

              {/* Rotating Tips */}
              <div className="mt-4 p-3 bg-background/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    Pro Tip
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tips[currentTip]}
                  </span>
                </div>
              </div>
            </div>

            {/* Dismiss Button */}
            {showDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Dismiss welcome banner"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Feature card component for the welcome banner
 */
interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background/30 border border-border/30">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}

/**
 * Helpful tips that rotate in the banner
 */
const tips = [
  "Use commands like /clone, /figma, or /page to quickly access specialized features.",
  "You can upload files like images, documents, and code to get contextual help.",
  "Press Cmd/Ctrl + K to quickly search through your chat history.",
  "Your conversations are automatically saved and organized by date.",
  "Ask follow-up questions to dive deeper into any topic.",
  "Use specific, detailed questions to get the most helpful responses.",
];

/**
 * First-time user welcome banner
 * Specialized version for users who haven't used the app before
 */
export function FirstTimeWelcomeBanner({ className }: { className?: string }) {
  return (
    <div className={cn(
      "px-6 py-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-b",
      className
    )}>
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to OpenChat!
          </h1>
          <p className="text-muted-foreground">
            Start your first AI conversation below. Ask questions, get help with projects, 
            or explore what's possible with AI assistance.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {['Ask about React', 'Code review help', 'Writing assistance', 'Math problems'].map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}