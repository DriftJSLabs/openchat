/**
 * OpenChat Security: Safe Command Execution
 * 
 * This module provides secure command execution utilities that prevent
 * command injection vulnerabilities while maintaining functionality.
 * 
 * Features:
 * - Input sanitization and validation
 * - Command whitelisting
 * - Parameter escaping
 * - Execution logging and monitoring
 * - Timeout and resource limits
 */

import { $ } from "bun";
import { spawn } from "bun";

export interface CommandExecutionOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  allowedCommands?: string[];
  maxOutputSize?: number;
  logExecution?: boolean;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  command: string;
}

/**
 * Whitelist of allowed commands for security
 * SECURITY: Only these commands can be executed
 */
const DEFAULT_ALLOWED_COMMANDS = [
  'docker',
  'git',
  'bunx',
  'bun',
  'node',
  'pg_isready',
  'psql',
  'redis-cli',
  'curl',
  'wget',
  'ls',
  'cat',
  'echo',
  'mkdir',
  'rm',
  'cp',
  'mv',
  'chmod',
  'find',
  'grep'
] as const;

/**
 * Commands that require special security considerations
 */
const HIGH_RISK_COMMANDS = [
  'rm',
  'mv',
  'chmod',
  'find',
  'grep',
  'docker'
] as const;

/**
 * Dangerous command patterns that should never be allowed
 */
const DANGEROUS_PATTERNS = [
  /;\s*(rm|sudo|su|passwd|chmod\s+777)/,
  /\|\s*(rm|sudo|su|passwd)/,
  /&&\s*(rm|sudo|su|passwd)/,
  /\$\(.*\)/,  // Command substitution
  /`.*`/,      // Backtick command substitution  
  />\s*\/dev\/null;\s*(rm|sudo)/,
  /--.*=.*[;&|`$]/, // Injection via command line options
] as const;

/**
 * Secure command executor class
 */
export class SecureCommandExecutor {
  private options: Required<CommandExecutionOptions>;
  private executionLog: Array<{ timestamp: Date; command: string; result: CommandResult }> = [];

  constructor(options: CommandExecutionOptions = {}) {
    this.options = {
      timeout: options.timeout || 30000, // 30 seconds default
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      allowedCommands: options.allowedCommands || [...DEFAULT_ALLOWED_COMMANDS],
      maxOutputSize: options.maxOutputSize || 1024 * 1024, // 1MB default
      logExecution: options.logExecution ?? true
    };
  }

  /**
   * Execute a command safely with full validation
   */
  async executeCommand(
    command: string, 
    args: string[] = [], 
    options: Partial<CommandExecutionOptions> = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    
    // Validate command safety
    const validation = this.validateCommand(command, args);
    if (!validation.isValid) {
      throw new Error(`Command execution blocked: ${validation.reason}`);
    }

    // Build sanitized command
    const sanitizedArgs = args.map(arg => this.sanitizeArgument(arg));
    const fullCommand = `${command} ${sanitizedArgs.join(' ')}`.trim();

    if (mergedOptions.logExecution) {
      console.log(`[SECURE-EXEC] Executing: ${fullCommand}`);
    }

    try {
      // Execute using Bun's spawn for better control
      const proc = spawn([command, ...sanitizedArgs], {
        cwd: mergedOptions.cwd,
        env: mergedOptions.env,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        proc.kill();
        throw new Error(`Command timed out after ${mergedOptions.timeout}ms`);
      }, mergedOptions.timeout);

      // Wait for completion
      const result = await proc.exited;
      clearTimeout(timeoutId);

      // Read outputs with size limits
      const stdout = await this.readStreamSafely(proc.stdout, mergedOptions.maxOutputSize);
      const stderr = await this.readStreamSafely(proc.stderr, mergedOptions.maxOutputSize);

      const commandResult: CommandResult = {
        success: result === 0,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: result || 0,
        executionTime: Date.now() - startTime,
        command: fullCommand
      };

      // Log execution
      if (mergedOptions.logExecution) {
        this.logCommandExecution(fullCommand, commandResult);
      }

      return commandResult;

    } catch (error) {
      const commandResult: CommandResult = {
        success: false,
        stdout: '',
        stderr: error.message || 'Unknown error',
        exitCode: -1,
        executionTime: Date.now() - startTime,
        command: fullCommand
      };

      if (mergedOptions.logExecution) {
        this.logCommandExecution(fullCommand, commandResult);
      }

      throw new Error(`Command execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a Docker command with additional safety measures
   */
  async executeDockerCommand(
    dockerArgs: string[],
    options: Partial<CommandExecutionOptions> = {}
  ): Promise<CommandResult> {
    // Additional Docker-specific validation
    const validation = this.validateDockerCommand(dockerArgs);
    if (!validation.isValid) {
      throw new Error(`Docker command blocked: ${validation.reason}`);
    }

    return this.executeCommand('docker', dockerArgs, {
      ...options,
      timeout: options.timeout || 60000, // Docker commands may take longer
    });
  }

  /**
   * Execute a database command safely
   */
  async executeDatabaseCommand(
    command: 'psql' | 'pg_isready' | 'redis-cli',
    args: string[] = [],
    options: Partial<CommandExecutionOptions> = {}
  ): Promise<CommandResult> {
    // Validate database command arguments
    const sanitizedArgs = args.filter(arg => {
      // Remove potentially dangerous SQL injection attempts
      return !this.containsDangerousPatterns(arg);
    });

    return this.executeCommand(command, sanitizedArgs, options);
  }

  /**
   * Validate command safety before execution
   */
  private validateCommand(command: string, args: string[]): { isValid: boolean; reason?: string } {
    // Check if command is whitelisted
    if (!this.options.allowedCommands.includes(command as any)) {
      return { isValid: false, reason: `Command '${command}' not in whitelist` };
    }

    // Check for dangerous patterns in command
    if (this.containsDangerousPatterns(command)) {
      return { isValid: false, reason: `Command contains dangerous patterns` };
    }

    // Check arguments for dangerous patterns
    for (const arg of args) {
      if (this.containsDangerousPatterns(arg)) {
        return { isValid: false, reason: `Argument contains dangerous patterns: ${arg.substring(0, 50)}` };
      }
    }

    // Special validation for high-risk commands
    if (HIGH_RISK_COMMANDS.includes(command as any)) {
      const riskValidation = this.validateHighRiskCommand(command, args);
      if (!riskValidation.isValid) {
        return riskValidation;
      }
    }

    return { isValid: true };
  }

  /**
   * Validate Docker-specific command safety
   */
  private validateDockerCommand(args: string[]): { isValid: boolean; reason?: string } {
    // Prevent dangerous Docker operations
    const dangerousDockerCommands = ['rm', 'rmi', 'system', 'network'];
    const firstArg = args[0];

    if (dangerousDockerCommands.includes(firstArg)) {
      // Allow only with specific safe flags
      if (firstArg === 'rm' && !args.includes('-f')) {
        return { isValid: true }; // Safe remove without force
      }
      if (firstArg === 'system' && args.includes('prune') && args.includes('-f')) {
        return { isValid: true }; // Allow system prune with force
      }
      return { isValid: false, reason: `Dangerous Docker command: ${firstArg}` };
    }

    // Check for volume mounting attempts that could be dangerous
    const volumeIndex = args.indexOf('-v');
    if (volumeIndex !== -1 && volumeIndex + 1 < args.length) {
      const volumeArg = args[volumeIndex + 1];
      if (volumeArg.includes(':/') && !volumeArg.startsWith('./')) {
        return { isValid: false, reason: 'Dangerous volume mount detected' };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate high-risk commands with additional checks
   */
  private validateHighRiskCommand(command: string, args: string[]): { isValid: boolean; reason?: string } {
    switch (command) {
      case 'rm':
        // Only allow rm with specific patterns
        if (args.some(arg => arg === '-rf' || arg === '-r')) {
          return { isValid: false, reason: 'Recursive rm not allowed' };
        }
        if (args.some(arg => arg.startsWith('/') && !arg.startsWith('/tmp/'))) {
          return { isValid: false, reason: 'rm on system paths not allowed' };
        }
        break;
        
      case 'chmod':
        // Prevent dangerous permission changes
        if (args.some(arg => arg === '777' || arg === '666')) {
          return { isValid: false, reason: 'Dangerous chmod permissions not allowed' };
        }
        break;
        
      case 'find':
      case 'grep':
        // Limit to safe directories
        const hasSystemPath = args.some(arg => 
          arg.startsWith('/etc/') || 
          arg.startsWith('/var/') || 
          arg.startsWith('/sys/')
        );
        if (hasSystemPath) {
          return { isValid: false, reason: 'System path access not allowed' };
        }
        break;
    }

    return { isValid: true };
  }

  /**
   * Check if input contains dangerous patterns
   */
  private containsDangerousPatterns(input: string): boolean {
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
  }

  /**
   * Sanitize command arguments to prevent injection
   */
  private sanitizeArgument(arg: string): string {
    // Remove null bytes
    let sanitized = arg.replace(/\0/g, '');
    
    // Escape shell metacharacters if they exist
    const shellMetachars = /[;&|`$(){}[\]<>'"\\]/;
    if (shellMetachars.test(sanitized)) {
      // For arguments containing metacharacters, use single quotes and escape internal quotes
      sanitized = `'${sanitized.replace(/'/g, "'\"'\"'")}'`;
    }
    
    return sanitized;
  }

  /**
   * Read from stream safely with size limits
   */
  private async readStreamSafely(stream: ReadableStream<Uint8Array> | null, maxSize: number): Promise<string> {
    if (!stream) return '';
    
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > maxSize) {
          throw new Error(`Output size exceeds limit (${maxSize} bytes)`);
        }

        chunks.push(value);
      }

      // Convert chunks to string
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(combined);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Log command execution for security monitoring
   */
  private logCommandExecution(command: string, result: CommandResult): void {
    const logEntry = {
      timestamp: new Date(),
      command,
      result
    };

    this.executionLog.push(logEntry);

    // Keep only last 100 executions
    if (this.executionLog.length > 100) {
      this.executionLog.shift();
    }

    // Log security-relevant information
    if (!result.success || result.stderr.includes('permission denied')) {
      console.warn(`[SECURE-EXEC] Command failed or permission denied: ${command}`);
    }
  }

  /**
   * Get execution history for security monitoring
   */
  getExecutionHistory(): typeof this.executionLog {
    return [...this.executionLog];
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionLog = [];
  }
}

/**
 * Default secure executor instance
 */
export const secureExecutor = new SecureCommandExecutor({
  logExecution: process.env.NODE_ENV === 'development',
  timeout: 30000,
  maxOutputSize: 1024 * 1024 // 1MB
});

/**
 * Convenience function for safe command execution
 */
export async function execSecure(
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
): Promise<CommandResult> {
  return secureExecutor.executeCommand(command, args, options);
}

/**
 * Convenience function for safe Docker command execution
 */
export async function execDockerSecure(
  args: string[],
  options: CommandExecutionOptions = {}
): Promise<CommandResult> {
  return secureExecutor.executeDockerCommand(args, options);
}