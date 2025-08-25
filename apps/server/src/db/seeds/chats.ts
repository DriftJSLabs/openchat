/**
 * Chat seed data for OpenChat
 * 
 * This module contains seed data and functions for creating chat records
 * across different environments (development, test, demo).
 */

import { nanoid } from "nanoid";
import chalk from "chalk";
import { chat } from "../schema/chat";

interface SeedChatOptions {
  count: number;
  users: Array<{ id: string; name: string; email: string }>;
  environment: 'development' | 'test' | 'demo';
}

interface SeededChat {
  id: string;
  title: string;
  userId: string;
  chatType: "conversation" | "assistant" | "group" | "system";
  settings?: string;
  tags?: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate realistic chat data based on environment with better titles and types
 */
function generateChatData(environment: string, index: number = 0): Omit<SeededChat, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
  const testChats = [
    { 
      title: 'Test Chat 1', 
      chatType: 'conversation' as const,
      isPinned: false,
      isArchived: false
    },
    { 
      title: 'AI Assistant Test', 
      chatType: 'assistant' as const,
      isPinned: false,
      isArchived: false
    }
  ];
  
  const demoChats = [
    {
      title: '🚀 Product Launch Strategy',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['work', 'planning', 'product']),
      isPinned: true,
      isArchived: false,
      settings: JSON.stringify({ notifications: true, theme: 'default' })
    },
    {
      title: '🤖 AI Development Assistant',
      chatType: 'assistant' as const,
      tags: JSON.stringify(['ai', 'coding', 'help']),
      isPinned: true,
      isArchived: false
    },
    {
      title: '🎬 Weekend Movie Night',
      chatType: 'group' as const,
      tags: JSON.stringify(['social', 'movies', 'fun']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '📚 Book Club Discussion',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['books', 'reading', 'discussion']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '🍳 Recipe Exchange',
      chatType: 'group' as const,
      tags: JSON.stringify(['cooking', 'recipes', 'food']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '💪 Fitness Motivation',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['health', 'fitness', 'motivation']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '🎨 Creative Projects',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['art', 'creativity', 'projects']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '🌍 Travel Planning',
      chatType: 'group' as const,
      tags: JSON.stringify(['travel', 'vacation', 'planning']),
      isPinned: false,
      isArchived: true
    }
  ];
  
  const devChats = [
    {
      title: '👨‍💻 Development Chat',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['dev', 'coding', 'work']),
      isPinned: true,
      isArchived: false,
      settings: JSON.stringify({ notifications: true, autosave: true })
    },
    {
      title: '🤖 Claude AI Assistant',
      chatType: 'assistant' as const,
      tags: JSON.stringify(['ai', 'assistant', 'help']),
      isPinned: true,
      isArchived: false
    },
    {
      title: '🐛 Bug Triage Discussion',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['bugs', 'testing', 'qa']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '🎯 Feature Planning',
      chatType: 'group' as const,
      tags: JSON.stringify(['features', 'planning', 'roadmap']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '📊 Performance Analysis',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['performance', 'analysis', 'optimization']),
      isPinned: false,
      isArchived: false
    },
    {
      title: '🔒 Security Review',
      chatType: 'conversation' as const,
      tags: JSON.stringify(['security', 'review', 'audit']),
      isPinned: false,
      isArchived: true
    }
  ];
  
  const chatSets = {
    test: testChats,
    demo: demoChats,
    development: devChats
  };
  
  const chats = chatSets[environment] || devChats;
  return chats[index % chats.length];
}

/**
 * Seed chats into the database
 */
export async function seedChats(db: any, options: SeedChatOptions): Promise<SeededChat[]> {
  console.log(chalk.blue(`  💬 Seeding ${options.count} chats...`));
  
  if (options.users.length === 0) {
    throw new Error('Cannot seed chats without users');
  }
  
  const seededChats: SeededChat[] = [];
  const now = new Date();
  
  // Generate chat records
  const chatRecords = [];
  
  for (let i = 0; i < options.count; i++) {
    // Select a user (distribute evenly for development, randomly for others)
    const selectedUser = options.environment === 'development' 
      ? options.users[i % options.users.length]
      : options.users[Math.floor(Math.random() * options.users.length)];
    
    const chatData = generateChatData(options.environment, i);
    
    const chatRecord: SeededChat = {
      id: nanoid(),
      title: chatData.title,
      userId: selectedUser.id,
      chatType: chatData.chatType,
      settings: chatData.settings,
      tags: chatData.tags,
      isPinned: chatData.isPinned,
      isArchived: chatData.isArchived,
      createdAt: new Date(now.getTime() - Math.random() * 60 * 24 * 60 * 60 * 1000), // Within last 60 days
      updatedAt: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000)    // Within last week
    };
    
    chatRecords.push(chatRecord);
    seededChats.push(chatRecord);
  }
  
  try {
    // Insert chats into database
    await db.insert(chat).values(chatRecords);
    
    console.log(chalk.green(`  ✅ Successfully seeded ${seededChats.length} chats`));
    
    // Log sample chat info in verbose mode
    if (process.argv.includes('--verbose')) {
      console.log(chalk.gray('  Sample chats:'));
      seededChats.slice(0, 3).forEach(chatRecord => {
        const owner = options.users.find(u => u.id === chatRecord.userId);
        console.log(chalk.gray(`    - "${chatRecord.title}" [${chatRecord.chatType}] (owned by ${owner?.name})`));
      });
      if (seededChats.length > 3) {
        console.log(chalk.gray(`    ... and ${seededChats.length - 3} more`));
      }
    }
    
    return seededChats;
    
  } catch (error) {
    console.error(chalk.red(`  ❌ Failed to seed chats: ${error.message}`));
    throw error;
  }
}

/**
 * Create a specific test chat for consistent testing
 */
export async function createTestChat(
  db: any, 
  chatData: Partial<SeededChat> & { userId: string }
): Promise<SeededChat> {
  const chatRecord: SeededChat = {
    id: chatData.id || nanoid(),
    title: chatData.title || 'Test Chat',
    userId: chatData.userId,
    chatType: chatData.chatType || 'conversation',
    settings: chatData.settings,
    tags: chatData.tags,
    isPinned: chatData.isPinned || false,
    isArchived: chatData.isArchived || false,
    createdAt: chatData.createdAt || new Date(),
    updatedAt: chatData.updatedAt || new Date()
  };
  
  await db.insert(chat).values([chatRecord]);
  return chatRecord;
}