#!/usr/bin/env bun

/**
 * Simple seed script for development
 * Creates a basic dev user and some sample chats
 */

import { db, user, chat } from "../src/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import chalk from "chalk";

const DEV_USER = {
  email: 'dev@openchat.local',
  name: 'Developer User',
  emailVerified: true,
  image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face'
};

async function createDevUser() {
  console.log(chalk.blue('Creating development user...'));
  
  try {
    // Check if dev user already exists - select only basic fields to avoid schema mismatch
    const existingUser = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })
      .from(user)
      .where(eq(user.email, DEV_USER.email))
      .limit(1);

    if (existingUser.length > 0) {
      console.log(chalk.yellow('✅ Dev user already exists:', DEV_USER.email));
      return existingUser[0];
    }

    // Create dev user with minimal required fields that match the schema
    const newUser = {
      id: nanoid(),
      name: DEV_USER.name,
      email: DEV_USER.email,
      emailVerified: DEV_USER.emailVerified,
      image: DEV_USER.image,
      // Include required timestamp fields
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [createdUser] = await db
      .insert(user)
      .values(newUser)
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });

    console.log(chalk.green('✅ Dev user created successfully:', DEV_USER.email));
    return createdUser;

  } catch (error) {
    console.error(chalk.red('❌ Failed to create dev user:'), error);
    throw error;
  }
}

async function createSampleChats(userId: string) {
  console.log(chalk.blue('Creating sample chats...'));
  
  const sampleChats = [
    {
      title: '👨‍💻 Development Chat',
      chatType: 'conversation' as const,
      isPinned: true,
      isArchived: false
    },
    {
      title: '🤖 AI Assistant',
      chatType: 'assistant' as const,
      isPinned: true,
      isArchived: false
    },
    {
      title: '🚀 Project Planning',
      chatType: 'conversation' as const,
      isPinned: false,
      isArchived: false
    }
  ];

  try {
    const chatRecords = sampleChats.map(chatData => ({
      id: nanoid(),
      title: chatData.title,
      userId: userId,
      chatType: chatData.chatType,
      isPinned: chatData.isPinned,
      isArchived: chatData.isArchived,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await db.insert(chat).values(chatRecords);
    
    console.log(chalk.green(`✅ Created ${chatRecords.length} sample chats`));
    return chatRecords;

  } catch (error) {
    console.error(chalk.red('❌ Failed to create sample chats:'), error);
    throw error;
  }
}

async function main() {
  console.log(chalk.blue.bold('\n🌱 Simple OpenChat Development Seed\n'));
  
  try {
    // Create dev user
    const devUser = await createDevUser();
    
    // Create sample chats
    await createSampleChats(devUser.id);
    
    console.log(chalk.green.bold('\n🎉 Simple seed completed successfully!\n'));
    console.log(chalk.cyan('Now you can:'));
    console.log(chalk.cyan('1. Start the server: bun run dev'));
    console.log(chalk.cyan('2. Start the web app: bun run dev:web'));
    console.log(chalk.cyan('3. Use the "👨‍💻 Dev Auto-Login" button in the login modal'));
    console.log(chalk.cyan(`4. Login as: ${DEV_USER.email}\n`));

  } catch (error) {
    console.error(chalk.red.bold('\n❌ Seed failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}