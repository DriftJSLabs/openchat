/**
 * User seed data for OpenChat
 * 
 * This module contains seed data and functions for creating user records
 * across different environments (development, test, demo).
 */

import { nanoid } from "nanoid";
import chalk from "chalk";
import { user } from "../schema/auth";

interface SeedUserOptions {
  count: number;
  environment: 'development' | 'test' | 'demo';
}

interface SeededUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
  username?: string;
  displayName?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate realistic sample user data with enhanced profiles
 */
function generateUserData(environment: string, index: number = 0): Omit<SeededUser, 'id' | 'createdAt' | 'updatedAt'> {
  const testUsers = [
    { 
      email: 'test1@example.com', 
      name: 'Test User 1', 
      emailVerified: true, 
      username: 'testuser1',
      bio: 'Test user for development'
    },
    { 
      email: 'test2@example.com', 
      name: 'Test User 2', 
      emailVerified: true, 
      username: 'testuser2',
      bio: 'Another test user'
    }
  ];
  
  const demoUsers = [
    { 
      email: 'alice@openchat.dev', 
      name: 'Alice Johnson', 
      image: 'https://images.unsplash.com/photo-1494790108755-2616b612b593?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'alice',
      displayName: 'Alice 🌟',
      bio: 'Product designer who loves crafting beautiful user experiences'
    },
    { 
      email: 'bob@openchat.dev', 
      name: 'Bob Smith', 
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'bob',
      displayName: 'Bob the Builder',
      bio: 'Full-stack developer building the future, one line of code at a time'
    },
    { 
      email: 'carol@openchat.dev', 
      name: 'Carol Davis', 
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'carol',
      displayName: 'Carol ☕',
      bio: 'Coffee enthusiast and marketing strategist'
    },
    { 
      email: 'david@openchat.dev', 
      name: 'David Wilson', 
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'david',
      bio: 'Data scientist exploring the intersection of AI and human creativity'
    },
    { 
      email: 'eva@openchat.dev', 
      name: 'Eva Rodriguez', 
      image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'eva',
      displayName: 'Eva 🚀',
      bio: 'Startup founder and tech evangelist'
    }
  ];
  
  const devUsers = [
    { 
      email: 'dev@openchat.local', 
      name: 'Developer User', 
      image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'dev',
      displayName: 'Dev User 👨‍💻',
      bio: 'Main development user for testing and debugging'
    },
    { 
      email: 'admin@openchat.local', 
      name: 'Admin User', 
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'admin',
      bio: 'Administrator account for system management'
    },
    { 
      email: 'alice@openchat.local', 
      name: 'Alice Chen', 
      image: 'https://images.unsplash.com/photo-1494790108755-2616b612b593?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'alice_local',
      bio: 'Designer working on the next generation of chat interfaces'
    },
    { 
      email: 'bob@openchat.local', 
      name: 'Bob Martinez', 
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
      emailVerified: true,
      username: 'bob_local',
      bio: 'Backend engineer passionate about scalable systems'
    },
    { 
      email: 'charlie@openchat.local', 
      name: 'Charlie Kim', 
      emailVerified: true,
      username: 'charlie',
      bio: 'AI researcher exploring conversational AI'
    }
  ];
  
  const userSets = {
    test: testUsers,
    demo: demoUsers,
    development: devUsers
  };
  
  const users = userSets[environment] || devUsers;
  return users[index % users.length];
}

/**
 * Seed users into the database
 */
export async function seedUsers(db: any, options: SeedUserOptions): Promise<SeededUser[]> {
  console.log(chalk.blue(`  📤 Seeding ${options.count} users...`));
  
  const seededUsers: SeededUser[] = [];
  const now = new Date();
  
  // Generate user records
  const userRecords = [];
  const usedEmails = new Set<string>();
  const usedUsernames = new Set<string>();
  
  for (let i = 0; i < options.count; i++) {
    let userData = generateUserData(options.environment, i);
    
    // Ensure unique emails by appending index if needed
    let email = userData.email;
    let counter = 1;
    while (usedEmails.has(email)) {
      const [localPart, domain] = userData.email.split('@');
      email = `${localPart}${counter}@${domain}`;
      counter++;
    }
    usedEmails.add(email);
    
    // Ensure unique usernames
    let username = userData.username;
    counter = 1;
    while (username && usedUsernames.has(username)) {
      username = `${userData.username}${counter}`;
      counter++;
    }
    if (username) usedUsernames.add(username);
    
    const userId = nanoid();
    const user: SeededUser = {
      id: userId,
      email,
      name: userData.name,
      image: userData.image,
      emailVerified: userData.emailVerified,
      username,
      displayName: userData.displayName,
      bio: userData.bio,
      createdAt: new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random creation time within last 90 days
      updatedAt: now
    };
    
    userRecords.push(user);
    seededUsers.push(user);
  }
  
  try {
    // Insert users into database
    await db.insert(user).values(userRecords);
    
    console.log(chalk.green(`  ✅ Successfully seeded ${seededUsers.length} users`));
    
    // Log sample user info in verbose mode
    if (process.argv.includes('--verbose')) {
      console.log(chalk.gray('  Sample users:'));
      seededUsers.slice(0, 3).forEach(user => {
        console.log(chalk.gray(`    - ${user.name} (@${user.username}) (${user.email})`));
      });
      if (seededUsers.length > 3) {
        console.log(chalk.gray(`    ... and ${seededUsers.length - 3} more`));
      }
    }
    
    return seededUsers;
    
  } catch (error) {
    console.error(chalk.red(`  ❌ Failed to seed users: ${error.message}`));
    throw error;
  }
}

/**
 * Get the primary development user (will be used for auto-login)
 */
export function getDevUser(): Omit<SeededUser, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    email: 'dev@openchat.local',
    name: 'Developer User',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face',
    emailVerified: true,
    username: 'dev',
    displayName: 'Dev User 👨‍💻',
    bio: 'Main development user for testing and debugging'
  };
}

/**
 * Create a specific test user for consistent testing
 */
export async function createTestUser(db: any, userData: Partial<SeededUser>): Promise<SeededUser> {
  const testUser: SeededUser = {
    id: userData.id || nanoid(),
    email: userData.email || 'testuser@example.com',
    name: userData.name || 'Test User',
    image: userData.image,
    emailVerified: userData.emailVerified !== undefined ? userData.emailVerified : true,
    username: userData.username,
    displayName: userData.displayName,
    bio: userData.bio,
    createdAt: userData.createdAt || new Date(),
    updatedAt: userData.updatedAt || new Date()
  };
  
  await db.insert(user).values([testUser]);
  return testUser;
}