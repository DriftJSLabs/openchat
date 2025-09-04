"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Crown, Search, ChevronRight } from "lucide-react";
import { useOpenRouterAuth } from "@/contexts/openrouter-auth";
import { cn } from "@/lib/utils";

// Default models for when not connected
const defaultModels = [
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", isFree: false, pricing: undefined, description: undefined, context_length: undefined },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", isFree: false, pricing: undefined, description: undefined, context_length: undefined },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", isFree: false, pricing: undefined, description: undefined, context_length: undefined },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", provider: "Meta", isFree: true, pricing: undefined, description: undefined, context_length: undefined },
];

interface ModelSwitcherProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  compact?: boolean;
}

function formatPrice(price?: string) {
  if (!price || price === '0') return 'Free';
  const num = parseFloat(price);
  if (num < 0.001) return `$${(num * 1000000).toFixed(2)}/1M`;
  if (num < 1) return `$${(num * 1000).toFixed(2)}/1K`;
  return `$${num.toFixed(3)}`;
}



export function ModelSwitcher({ selectedModel, onModelChange, compact = false }: ModelSwitcherProps) {
  const { isConnected, availableModels, modelsLoading } = useOpenRouterAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Free Models': true, // Free models expanded by default
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const models = isConnected && availableModels.length > 0 
    ? availableModels.map(model => ({
        id: model.id,
        name: model.name,
        provider: model.id.split('/')[0] || 'Unknown',
        isFree: model.pricing?.prompt === '0' && model.pricing?.completion === '0',
        pricing: model.pricing,
        description: model.description,
        context_length: model.context_length,
      }))
    : defaultModels;

  const currentModel = models.find(m => m.id === selectedModel) || models[0];

  // Filter models based on search
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group filtered models
  const freeModels = filteredModels.filter(m => m.isFree);
  const paidModels = filteredModels.filter(m => !m.isFree);
  
  // Group paid models by provider
  const groupedPaidModels = paidModels.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, typeof models>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleModelSelect = (modelId: string) => {
    console.log('Model selected:', modelId);
    onModelChange(modelId);
    setSearchQuery(""); // Clear search when model is selected
  };

  // When not connected, show disabled model selector with better messaging
  if (!isConnected) {
    return (
      <Button 
        variant="outline"
        size={compact ? "sm" : "default"}
        className={cn(
          "justify-start font-medium border-border/50 opacity-60 cursor-not-allowed",
          compact ? "h-8 px-2 text-xs max-w-[140px]" : "h-9 px-3 text-sm min-w-[180px] max-w-[220px]"
        )}
        disabled={true}
        title="Connect OpenRouter from the sidebar to enable AI models"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="truncate text-muted-foreground">Connect to use AI</span>
        </div>
        <ChevronDown className="h-4 w-4 ml-auto flex-shrink-0 text-muted-foreground opacity-50" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(
            "justify-start font-medium border-border/50 hover:bg-accent hover:border-border",
            compact ? "h-8 px-2 text-xs max-w-[140px]" : "h-9 px-3 text-sm min-w-[180px] max-w-[220px]"
          )}
          disabled={modelsLoading}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="truncate text-foreground">{currentModel.name}</span>
            {currentModel.isFree && <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />}
          </div>
          <ChevronDown className="h-4 w-4 ml-auto flex-shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-80 max-h-[70vh] overflow-hidden"
      >
        {/* Search Input */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        
        <DropdownMenuSeparator />
        
        <div className="max-h-96 overflow-y-auto">
          {/* Free Models */}
          {freeModels.length > 0 && (
            <>
              <DropdownMenuLabel 
                className="cursor-pointer flex items-center justify-between hover:bg-accent px-2 py-2"
                onClick={() => toggleCategory('Free Models')}
              >
                <span className="flex items-center gap-2">
                  Free Models ({freeModels.length})
                </span>
                <ChevronRight className={cn(
                  "h-4 w-4 transition-transform",
                  expandedCategories['Free Models'] && "rotate-90"
                )} />
              </DropdownMenuLabel>
              {expandedCategories['Free Models'] && freeModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  className="cursor-pointer p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{model.name}</span>
                        <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {model.provider} • Free
                      </span>
                    </div>
                  </div>
                  {selectedModel === model.id && (
                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Paid Models by Provider */}
          {Object.entries(groupedPaidModels).map(([provider, providerModels]) => (
            <DropdownMenuGroup key={provider}>
              <DropdownMenuLabel 
                className="cursor-pointer flex items-center justify-between hover:bg-accent px-2 py-2"
                onClick={() => toggleCategory(provider)}
              >
                <span className="flex items-center gap-2">
                  {provider} ({providerModels.length})
                </span>
                <ChevronRight className={cn(
                  "h-4 w-4 transition-transform",
                  expandedCategories[provider] && "rotate-90"
                )} />
              </DropdownMenuLabel>
              {expandedCategories[provider] && providerModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  className="cursor-pointer p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{model.name}</span>
                        {model.pricing && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded flex-shrink-0">
                            {formatPrice(model.pricing.prompt)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {model.provider}
                        {model.context_length && ` • ${(model.context_length / 1000).toFixed(0)}k`}
                      </span>
                    </div>
                  </div>
                  {selectedModel === model.id && (
                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          
          {filteredModels.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No models found matching "{searchQuery}"
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}