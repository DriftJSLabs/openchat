"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import hljs from "highlight.js/lib/core";
import { cn } from "@/lib/utils";

// Import specific languages for better performance
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import xml from "highlight.js/lib/languages/xml"; // Also handles HTML
import css from "highlight.js/lib/languages/css";
import scss from "highlight.js/lib/languages/scss";
import plaintext from "highlight.js/lib/languages/plaintext";

// Register languages
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash); // Alias
hljs.registerLanguage("sh", bash); // Alias
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml); // Alias
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c++", cpp); // Alias
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp); // Alias
hljs.registerLanguage("c#", csharp); // Alias
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby); // Alias
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("kt", kotlin); // Alias
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml); // HTML uses XML
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("sass", scss); // Alias
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext); // Alias

// Import highlight.js theme
import "highlight.js/styles/github-dark.css";

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

// Language display names
const languageNames: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  bash: "Bash",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cpp: "C++",
  "c++": "C++",
  csharp: "C#",
  cs: "C#",
  "c#": "C#",
  php: "PHP",
  ruby: "Ruby",
  rb: "Ruby",
  swift: "Swift",
  kotlin: "Kotlin",
  kt: "Kotlin",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  plaintext: "Plain Text",
  text: "Plain Text",
};

// Auto-detect language based on content
const detectLanguage = (code: string, className?: string): string => {
  // First check className
  if (className?.startsWith('language-')) {
    const lang = className.replace('language-', '').toLowerCase();
    // Check if we support this language
    if (hljs.getLanguage(lang)) {
      return lang;
    }
  }
  
  // Try auto-detection with highlight.js
  try {
    const result = hljs.highlightAuto(code, [
      'javascript', 'typescript', 'python', 'json', 'bash', 'sql',
      'yaml', 'rust', 'go', 'java', 'cpp', 'csharp', 'php', 'ruby',
      'swift', 'kotlin', 'html', 'css', 'scss'
    ]);
    if (result.language) {
      return result.language;
    }
  } catch (e) {
    // Fallback to plaintext if auto-detection fails
  }
  
  return 'plaintext';
};

export function MessageContent({ content, isStreaming = false }: MessageContentProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(id);
      // Reset after 2 seconds
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      }
  };

  return (
    <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs with proper text color
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed text-foreground">{children}</p>
          ),
          
          // Code blocks with syntax highlighting and always-visible copy button
          pre: ({ children, ...props }: any) => {
            const codeElement = React.Children.toArray(children)[0] as React.ReactElement;
            if (!codeElement || typeof codeElement !== 'object' || !('props' in codeElement)) {
              return <pre {...props}>{children}</pre>;
            }
            
            const elementProps = codeElement.props as any;
            const codeContent = String(elementProps?.children || '').trim();
            const className = elementProps?.className || '';
            const detectedLang = detectLanguage(codeContent, className);
            const displayName = languageNames[detectedLang] || detectedLang;
            const codeId = `code-${Math.random().toString(36).substring(2, 11)}`;
            
            // Apply syntax highlighting
            let highlightedCode = codeContent;
            try {
              if (detectedLang && detectedLang !== 'plaintext') {
                highlightedCode = hljs.highlight(codeContent, { language: detectedLang }).value;
              }
            } catch (e) {
              // Use original code if highlighting fails
            }
            
            return (
              <div className="relative my-4 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                {/* Header with language label and copy button */}
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-xs font-medium text-zinc-400">
                      {displayName}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 transition-all",
                      copiedCode === codeId 
                        ? "text-green-400 hover:text-green-300 hover:bg-green-950/50" 
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                    )}
                    onClick={() => copyToClipboard(codeContent, codeId)}
                  >
                    <AnimatePresence mode="wait">
                      {copiedCode === codeId ? (
                        <motion.div
                          key="check"
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 180 }}
                          transition={{ 
                            type: "spring", 
                            stiffness: 300, 
                            damping: 20 
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>
                </div>
                
                {/* Code content */}
                <motion.div
                  animate={copiedCode === codeId ? { 
                    backgroundColor: ["rgba(34, 197, 94, 0)", "rgba(34, 197, 94, 0.05)", "rgba(34, 197, 94, 0)"] 
                  } : {}}
                  transition={{ duration: 0.5 }}
                  className="overflow-x-auto"
                >
                  <pre className="p-4 text-sm leading-relaxed">
                    <code 
                      className={`language-${detectedLang} text-zinc-100`}
                      dangerouslySetInnerHTML={{ __html: highlightedCode }}
                    />
                  </pre>
                </motion.div>
              </div>
            );
          },
          
          // Inline code with better styling
          code: ({ children, className, ...props }: any) => {
            const isInline = !className;
            return isInline ? (
              <code 
                className="rounded-md bg-zinc-800/70 dark:bg-zinc-900/70 px-1.5 py-0.5 text-xs font-mono text-zinc-100 dark:text-zinc-200" 
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={`${className} text-zinc-100`} {...props}>
                {children}
              </code>
            );
          },
          
          // Lists with proper text color
          ul: ({ children }) => (
            <ul className="mb-3 ml-4 list-disc space-y-1 text-foreground">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-4 list-decimal space-y-1 text-foreground">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed text-foreground">{children}</li>
          ),
          
          // Headings with proper text color
          h1: ({ children }) => (
            <h1 className="mb-3 text-2xl font-bold text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 text-xl font-bold text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-lg font-bold text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 text-base font-bold text-foreground">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="mb-2 text-sm font-bold text-foreground">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="mb-2 text-sm font-semibold text-foreground">{children}</h6>
          ),
          
          // Blockquotes with better styling
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-3">
              {children}
            </blockquote>
          ),
          
          // Tables with proper styling
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-900 dark:bg-zinc-950 border-b border-zinc-800">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-800">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-zinc-900/50 dark:hover:bg-zinc-950/50 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-foreground">
              {children}
            </td>
          ),
          
          // Links with better styling
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
          
          // Horizontal rules
          hr: () => (
            <hr className="my-4 border-zinc-800" />
          ),
          
          // Strong/Bold with proper color
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          
          // Emphasis/Italic with proper color
          em: ({ children }) => (
            <em className="italic text-foreground">{children}</em>
          ),
          
          // Strikethrough
          del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <motion.span 
          className="inline-block w-1 h-4 ml-1 bg-foreground"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
}