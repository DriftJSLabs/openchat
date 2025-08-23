#!/usr/bin/env node

const { spawn } = require('child_process');
const chalk = require('chalk');
const blessed = require('blessed');
const fs = require('fs');
const path = require('path');

class TUITestRunner {
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'OpenChat Test Runner'
    });

    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.skippedTests = 0;
    this.runningTest = '';
    this.failedTestDetails = [];
    this.startTime = Date.now();

    this.setupUI();
    this.setupEventHandlers();
  }

  setupUI() {
    // Header
    this.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}OpenChat Test Suite{/bold}{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'cyan' }
      },
      border: { type: 'line' }
    });

    // Progress bar container
    this.progressContainer = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: 5,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } }
    });

    // Progress bar
    this.progressBar = blessed.progressbar({
      parent: this.progressContainer,
      top: 1,
      left: 2,
      width: '96%',
      height: 1,
      filled: 0,
      style: {
        bar: { bg: 'green' },
        border: { fg: 'cyan' }
      }
    });

    // Stats
    this.stats = blessed.text({
      parent: this.progressContainer,
      top: 2,
      left: 2,
      width: '96%',
      height: 1,
      content: 'Starting tests...',
      style: { fg: 'white' }
    });

    // Current test
    this.currentTest = blessed.box({
      top: 8,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '{center}Initializing...{/center}',
      tags: true
    });

    // Real-time output
    this.output = blessed.log({
      top: 11,
      left: 0,
      width: '50%',
      height: '70%',
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Live Output ',
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true
    });

    // Failed tests
    this.failedBox = blessed.log({
      top: 11,
      left: '50%',
      width: '50%',
      height: '70%',
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      label: ' Failed Tests ',
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true
    });

    // Controls
    this.controls = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '{center}Press {bold}q{/bold} to quit | {bold}r{/bold} to restart | {bold}↑↓{/bold} to scroll{/center}',
      tags: true
    });

    // Add all components to screen
    this.screen.append(this.header);
    this.screen.append(this.progressContainer);
    this.screen.append(this.currentTest);
    this.screen.append(this.output);
    this.screen.append(this.failedBox);
    this.screen.append(this.controls);

    this.screen.render();
  }

  setupEventHandlers() {
    this.screen.key(['q', 'C-c'], () => {
      if (this.testProcess) {
        this.testProcess.kill();
      }
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.restart();
    });

    // Focus management
    this.screen.key(['tab'], () => {
      if (this.screen.focused === this.output) {
        this.failedBox.focus();
      } else {
        this.output.focus();
      }
      this.screen.render();
    });
  }

  updateStats() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const total = this.passedTests + this.failedTests + this.skippedTests;
    const progress = this.totalTests > 0 ? (total / this.totalTests) * 100 : 0;
    
    this.progressBar.setProgress(progress);
    
    this.stats.setContent(
      `✅ ${this.passedTests} passed | ❌ ${this.failedTests} failed | ⏭️  ${this.skippedTests} skipped | ⏱️  ${elapsed}s`
    );
    
    this.screen.render();
  }

  updateCurrentTest(testName) {
    this.runningTest = testName;
    this.currentTest.setContent(`{center}{bold}Running:{/bold} ${testName}{/center}`);
    this.screen.render();
  }

  addOutput(text, type = 'info') {
    const colors = {
      info: 'white',
      success: 'green',
      error: 'red',
      warning: 'yellow'
    };
    
    const color = colors[type] || 'white';
    this.output.log(`{${color}-fg}${text}{/${color}-fg}`);
    this.screen.render();
  }

  addFailedTest(testName, error) {
    this.failedTestDetails.push({ testName, error });
    this.failedBox.log(`{red-fg}{bold}❌ ${testName}{/bold}{/red-fg}`);
    this.failedBox.log(`{gray-fg}${error.substring(0, 200)}...{/gray-fg}`);
    this.failedBox.log(''); // Empty line
    this.screen.render();
  }

  async runTests() {
    this.addOutput('Starting test suite...', 'info');
    
    // Check if we're in the web directory
    const cwd = process.cwd().includes('/apps/web') 
      ? process.cwd() 
      : path.join(process.cwd(), 'apps/web');

    this.testProcess = spawn('bun', ['test'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let outputBuffer = '';
    let errorBuffer = '';

    this.testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      outputBuffer += text;
      
      // Parse test results in real-time
      this.parseTestOutput(text);
      
      // Show recent output
      const lines = text.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        if (line.includes('✓')) {
          this.addOutput(line, 'success');
        } else if (line.includes('✗')) {
          this.addOutput(line, 'error');
        } else if (line.includes('error:') || line.includes('Error:')) {
          this.addOutput(line, 'error');
        } else if (line.trim()) {
          this.addOutput(line, 'info');
        }
      });
    });

    this.testProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorBuffer += text;
      this.addOutput(text, 'error');
    });

    this.testProcess.on('close', (code) => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      
      if (code === 0) {
        this.currentTest.setContent(`{center}{green-fg}{bold}✅ All tests completed in ${elapsed}s{/bold}{/green-fg}{/center}`);
        this.addOutput('All tests passed! 🎉', 'success');
      } else {
        this.currentTest.setContent(`{center}{red-fg}{bold}❌ Tests failed (${this.failedTests} failures) in ${elapsed}s{/bold}{/red-fg}{/center}`);
        this.addOutput(`Tests completed with ${this.failedTests} failures`, 'error');
      }
      
      this.screen.render();
    });

    this.testProcess.on('error', (error) => {
      this.addOutput(`Failed to start test process: ${error.message}`, 'error');
    });
  }

  parseTestOutput(text) {
    // Count test results
    const passedMatches = text.match(/✓/g);
    const failedMatches = text.match(/✗/g);
    
    if (passedMatches) {
      this.passedTests += passedMatches.length;
    }
    
    if (failedMatches) {
      this.failedTests += failedMatches.length;
    }

    // Extract current test being run
    const testMatch = text.match(/(.+\.test\.ts):/);
    if (testMatch) {
      this.updateCurrentTest(testMatch[1]);
    }

    // Extract failed test details
    const lines = text.split('\n');
    let currentFailedTest = null;
    let errorDetails = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('✗')) {
        if (currentFailedTest) {
          this.addFailedTest(currentFailedTest, errorDetails);
        }
        currentFailedTest = line.replace('✗', '').trim();
        errorDetails = '';
      } else if (line.includes('error:') && currentFailedTest) {
        errorDetails += line + '\n';
      }
    }
    
    if (currentFailedTest && errorDetails) {
      this.addFailedTest(currentFailedTest, errorDetails);
    }

    this.updateStats();
  }

  restart() {
    if (this.testProcess) {
      this.testProcess.kill();
    }
    
    // Reset counters
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.skippedTests = 0;
    this.failedTestDetails = [];
    this.startTime = Date.now();
    
    // Clear outputs
    this.output.setContent('');
    this.failedBox.setContent('');
    
    // Restart tests
    this.runTests();
  }

  start() {
    this.runTests();
  }
}

// Dependencies should be installed already

// Start the TUI
const runner = new TUITestRunner();
runner.start();