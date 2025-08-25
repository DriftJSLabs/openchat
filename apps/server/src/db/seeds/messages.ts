/**
 * Message seed data for OpenChat
 * 
 * This module contains seed data and functions for creating realistic message records
 * across different environments (development, test, demo).
 */

import { nanoid } from "nanoid";
import chalk from "chalk";

// For now, we'll create a simple interface that matches what we can insert
// This will need to be updated when the new conversation/message schema is fully implemented

interface SeedMessageOptions {
  count: number;
  chats: Array<{ id: string; title: string; userId: string; chatType?: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  environment: 'development' | 'test' | 'demo';
}

interface SeededMessage {
  id: string;
  chatId: string;
  userId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate realistic message content with engaging conversations
 */
function generateMessageContent(environment: string, role: 'user' | 'assistant' | 'system', chatTitle?: string, messageIndex: number = 0): string {
  if (role === 'system') {
    const systemMessages = [
      "Chat created",
      "User joined the conversation",
      "Settings updated",
      "Chat archived"
    ];
    return systemMessages[messageIndex % systemMessages.length];
  }
  
  const devUserMessages = [
    "Hey team! Just pushed the latest changes to the feature branch. Could someone review the PR? 🚀",
    "I found a potential performance issue in the database queries. The joins are getting expensive.",
    "The new authentication system is working great! Tested with multiple users and sessions.",
    "Anyone else seeing build failures on the CI? My local build is fine but CI is failing.",
    "Let's schedule a code review session for tomorrow at 2 PM. I'll send calendar invites.",
    "Great work on the UI improvements! The new design feels much more intuitive and clean.",
    "Found a critical bug in payment processing. Users can't complete transactions right now.",
    "Just deployed the hotfix to production. Monitoring error rates and user reports.",
    "The test coverage is looking good - we're at 87% now. Almost at our 90% target!",
    "What do you think about adding dark mode? The user feedback has been overwhelmingly positive.",
    "I'm thinking we could implement it with CSS custom properties and a theme context.",
    "```typescript\nconst theme = useTheme();\nconst styles = theme === 'dark' ? darkStyles : lightStyles;\n```",
    "The post-mortem from yesterday's incident is scheduled for Friday. Let's document everything.",
    "Client feedback on the new feature was very positive. They especially loved the automation.",
    "Should we update the API documentation? Some endpoints have changed recently."
  ];
  
  const devAssistantMessages = [
    "I'd be happy to help you review that PR! I'll take a look at the code changes and test coverage.",
    "I can help optimize those database queries. Here are a few suggestions for improving the joins:",
    "That's excellent! The authentication flow is much more secure now with the session management.",
    "I can see the CI issue. It looks like a dependency version mismatch. Here's how to fix it:",
    "Great idea! I'll help prepare the agenda for the code review. We should cover these key areas:",
    "The UI improvements look fantastic! The user experience is significantly better now.",
    "I've identified the root cause of the payment bug. It's in the webhook validation logic:",
    "Good catch on deploying that hotfix! The error rates have dropped back to normal levels.",
    "Excellent progress on test coverage! Here are the areas that still need attention:",
    "Dark mode is a great addition! Here's a clean implementation approach using CSS variables:",
    "That's exactly the right approach! I'd also suggest adding system theme detection:",
    "```css\n@media (prefers-color-scheme: dark) {\n  :root { --primary: #ffffff; }\n}\n```",
    "I'll help document the incident timeline and prevention strategies for the post-mortem.",
    "That's wonderful feedback! The automation feature really streamlined their workflow.",
    "Absolutely! I can help update the API docs. Here's what's changed in the recent releases:"
  ];
  
  const demoUserMessages = [
    "I just finished reading 'The Seven Husbands of Evelyn Hugo' and wow, what a journey! 📚",
    "The character development was absolutely incredible. I couldn't put it down for days.",
    "For our next book club meeting, I'm thinking we could try some science fiction. Thoughts?",
    "What genre are we feeling for this weekend's movie night? Comedy, thriller, or sci-fi? 🎬",
    "I vote for a good thriller! It's been way too long since we watched something suspenseful.",
    "How about 'Gone Girl'? It's a psychological thriller that keeps you guessing until the end.",
    "Sounds perfect! Should we order our usual pizza for movie night? 🍕",
    "I made the most amazing pasta dish yesterday! Anyone want the recipe? 🍝",
    "It's a creamy mushroom and spinach linguine with garlic, white wine, and fresh parmesan.",
    "Just finished a 5K run and feeling absolutely amazing! The endorphins are real 💪",
    "That's awesome! How was your pace? I've been wanting to get back into running lately.",
    "I found some incredible flight deals to Barcelona for next month! Anyone interested? ✈️",
    "The weather should be perfect in March, and it's right before peak tourist season starts.",
    "I'd recommend staying in the Gothic Quarter - it's walkable and full of amazing history.",
    "The market research data for our product launch is looking very promising! 📊"
  ];
  
  const demoAssistantMessages = [
    "That sounds like an incredible book! I've heard so many great things about Taylor Jenkins Reid's writing style.",
    "The character development in her novels is always top-notch. What did you think of the plot twists?",
    "Science fiction is a great choice! Have you considered 'Project Hail Mary'? It's been getting rave reviews.",
    "I love the variety in your movie selections! For a thriller, 'Gone Girl' is an excellent choice.",
    "That's a perfect pick! The psychological elements make it really engaging. Great for group discussion.",
    "Fincher's direction in that film is masterful. The way he builds tension is absolutely brilliant.",
    "Pizza and movies are the perfect combination! What toppings does everyone usually prefer?",
    "That pasta dish sounds absolutely delicious! I'd love to hear about your cooking process.",
    "Fresh parmesan makes such a difference! Do you grate it yourself or buy it pre-grated?",
    "That's fantastic! Regular running has so many benefits beyond just physical fitness.",
    "Consistency is key with running! Start with shorter distances and gradually build up your endurance.",
    "Barcelona is absolutely beautiful! March is indeed perfect timing - great weather, fewer crowds.",
    "The Gothic Quarter is an excellent choice! The narrow medieval streets are full of hidden gems.",
    "You'll love the blend of history and modern culture there. The food scene is incredible too!",
    "That's exciting news about the market research! What aspects of the data stood out most to you?"
  ];
  
  const testMessages = [
    "This is a test message for integration testing purposes.",
    "Another test message to verify the seeding process works correctly.",
    "Testing message threading and reply functionality in the system."
  ];
  
  let messagePool: string[];
  
  if (environment === 'test') {
    messagePool = testMessages;
  } else if (environment === 'development') {
    messagePool = role === 'assistant' ? devAssistantMessages : devUserMessages;
  } else {
    messagePool = role === 'assistant' ? demoAssistantMessages : demoUserMessages;
  }
  
  return messagePool[messageIndex % messagePool.length];
}

/**
 * Seed messages into the database with realistic conversation flows
 */
export async function seedMessages(db: any, options: SeedMessageOptions): Promise<SeededMessage[]> {
  console.log(chalk.blue(`  💭 Seeding ${options.count} messages...`));
  
  if (options.chats.length === 0 || options.users.length === 0) {
    throw new Error('Cannot seed messages without chats and users');
  }
  
  const seededMessages: SeededMessage[] = [];
  const now = new Date();
  
  // Distribute messages across chats to create realistic conversation patterns
  const messagesPerChat = Math.ceil(options.count / options.chats.length);
  
  for (const chat of options.chats) {
    const chatMessageCount = Math.min(messagesPerChat, options.count - seededMessages.length);
    const baseTime = now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000; // Up to a week ago
    
    // Create a conversation flow for this chat
    for (let i = 0; i < chatMessageCount; i++) {
      // Determine message role and sender
      let role: 'user' | 'assistant' | 'system';
      let sender: any;
      
      if (chat.chatType === 'assistant' || (chat.title && chat.title.toLowerCase().includes('ai'))) {
        // AI assistant chats alternate between user questions and assistant responses
        role = i % 2 === 0 ? 'user' : 'assistant';
        if (role === 'user') {
          // User messages can come from chat owner or other users
          sender = i % 3 === 0 
            ? options.users.find(u => u.id === chat.userId) || options.users[0]
            : options.users[Math.floor(Math.random() * options.users.length)];
        } else {
          // Assistant messages - use a consistent 'assistant' user
          sender = options.users[0]; // In practice, this would be an AI assistant account
        }
      } else {
        // Regular conversation chats are mostly user messages with occasional system messages
        role = Math.random() > 0.95 ? 'system' : 'user';
        sender = role === 'system' 
          ? options.users[0] // System messages
          : (i % 3 === 0 
              ? options.users.find(u => u.id === chat.userId) || options.users[0] // Chat owner speaks more
              : options.users[Math.floor(Math.random() * options.users.length)]);
      }
      
      // Generate realistic content
      const content = generateMessageContent(options.environment, role, chat.title, seededMessages.length);
      
      // Create progressive timestamps (newer messages come later)
      const messageTime = baseTime + (i * 15 * 60 * 1000) + Math.random() * 10 * 60 * 1000; // 15 min intervals with some randomness
      
      const messageRecord: SeededMessage = {
        id: nanoid(),
        chatId: chat.id,
        userId: sender.id,
        content,
        role,
        createdAt: new Date(messageTime),
        updatedAt: new Date(messageTime + Math.random() * 1000) // Slight delay for updatedAt
      };
      
      seededMessages.push(messageRecord);
      
      if (seededMessages.length >= options.count) break;
    }
    
    if (seededMessages.length >= options.count) break;
  }
  
  try {
    // Note: We'll skip actual database insertion for now since the message table structure
    // might not match our interface exactly. This provides the structure for when it's ready.
    console.log(chalk.green(`  ✅ Successfully prepared ${seededMessages.length} messages`));
    console.log(chalk.yellow(`  ⚠️  Message insertion skipped - table structure needs verification`));
    
    // Log sample message info in verbose mode
    if (process.argv.includes('--verbose')) {
      console.log(chalk.gray('  Sample messages:'));
      seededMessages.slice(0, 3).forEach(msg => {
        const sender = options.users.find(u => u.id === msg.userId);
        const chat = options.chats.find(c => c.id === msg.chatId);
        const preview = msg.content.length > 60 ? msg.content.substring(0, 60) + '...' : msg.content;
        console.log(chalk.gray(`    - [${msg.role}] ${sender?.name} in "${chat?.title}": "${preview}"`));
      });
      if (seededMessages.length > 3) {
        console.log(chalk.gray(`    ... and ${seededMessages.length - 3} more`));
      }
    }
    
    return seededMessages;
    
  } catch (error) {
    console.error(chalk.red(`  ❌ Failed to seed messages: ${error.message}`));
    throw error;
  }
}

/**
 * Create a specific test message for consistent testing
 */
export async function createTestMessage(
  db: any, 
  messageData: Partial<SeededMessage> & { chatId: string; userId: string }
): Promise<SeededMessage> {
  const messageRecord: SeededMessage = {
    id: messageData.id || nanoid(),
    chatId: messageData.chatId,
    userId: messageData.userId,
    content: messageData.content || 'Test message content',
    role: messageData.role || 'user',
    createdAt: messageData.createdAt || new Date(),
    updatedAt: messageData.updatedAt || new Date()
  };
  
  // Skip actual insertion for now
  return messageRecord;
}