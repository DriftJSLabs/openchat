#!/usr/bin/env bun
import { spawn } from 'child_process'
import { readdirSync } from 'fs'
import { join } from 'path'

// ANSI color codes for beautiful terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
}

// Icons for test status
const icons = {
  running: '⚡',
  pass: '✅',
  fail: '❌',
  skip: '⏭️',
  pending: '⏳',
  warn: '⚠️',
  info: 'ℹ️',
  rocket: '🚀',
  bug: '🐛',
  check: '✓',
  cross: '✗',
  arrow: '→'
}

interface TestFile {
  name: string
  path: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  tests: number
  passed: number
  failed: number
  duration: number
  errors: string[]
}

interface TestSuite {
  files: TestFile[]
  totalTests: number
  totalPassed: number
  totalFailed: number
  totalDuration: number
  isRunning: boolean
  startTime: number
}

class CustomTestRunner {
  private suite: TestSuite = {
    files: [],
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalDuration: 0,
    isRunning: false,
    startTime: 0
  }

  private testDir = join(process.cwd(), 'src/__tests__')
  private intervalId: NodeJS.Timeout | null = null

  constructor() {
    this.discoverTests()
  }

  private discoverTests() {
    const files = readdirSync(this.testDir)
      .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.tsx'))
      .filter(file => file !== 'runner.ts')
      .sort()

    this.suite.files = files.map(file => ({
      name: file.replace(/\.test\.(ts|tsx)$/, ''),
      path: join(this.testDir, file),
      status: 'pending',
      tests: 0,
      passed: 0,
      failed: 0,
      duration: 0,
      errors: []
    }))
  }

  private clearScreen() {
    process.stdout.write('\x1b[2J\x1b[H')
  }

  private drawHeader() {
    const title = `${icons.rocket} OpenChat Test Runner`
    const subtitle = `Running ${this.suite.files.length} test files`
    
    console.log(`${colors.bold}${colors.cyan}╭─────────────────────────────────────────────────────────────╮${colors.reset}`)
    console.log(`${colors.bold}${colors.cyan}│${colors.white}  ${title.padEnd(57)}  ${colors.cyan}│${colors.reset}`)
    console.log(`${colors.bold}${colors.cyan}│${colors.dim}  ${subtitle.padEnd(57)}  ${colors.cyan}│${colors.reset}`)
    console.log(`${colors.bold}${colors.cyan}╰─────────────────────────────────────────────────────────────╯${colors.reset}`)
    console.log()
  }

  private drawProgress() {
    const completed = this.suite.files.filter(f => f.status !== 'pending' && f.status !== 'running').length
    const total = this.suite.files.length
    const percentage = Math.round((completed / total) * 100)
    
    const barWidth = 40
    const filled = Math.round((completed / total) * barWidth)
    const empty = barWidth - filled
    
    const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`
    
    const elapsed = this.suite.isRunning ? (Date.now() - this.suite.startTime) / 1000 : 0
    const timeStr = `${elapsed.toFixed(1)}s`
    
    console.log(`${colors.bold}Progress: ${colors.green}${bar}${colors.reset} ${percentage}% (${completed}/${total}) ${timeStr}`)
    console.log()
  }

  private drawStats() {
    const running = this.suite.files.filter(f => f.status === 'running').length
    const passed = this.suite.files.filter(f => f.status === 'passed').length
    const failed = this.suite.files.filter(f => f.status === 'failed').length
    
    console.log(`${colors.dim}Stats:${colors.reset}`)
    console.log(`  ${colors.green}${icons.check} Passed: ${passed}${colors.reset}`)
    console.log(`  ${colors.red}${icons.cross} Failed: ${failed}${colors.reset}`)
    console.log(`  ${colors.yellow}${icons.running} Running: ${running}${colors.reset}`)
    console.log(`  ${colors.cyan}Total Tests: ${this.suite.totalTests}${colors.reset}`)
    console.log()
  }

  private drawFileList() {
    console.log(`${colors.dim}Test Files:${colors.reset}`)
    
    this.suite.files.forEach((file) => {
      let statusIcon = icons.pending
      let statusColor = colors.dim
      let statusText = 'pending'
      
      switch (file.status) {
        case 'running':
          statusIcon = icons.running
          statusColor = colors.yellow
          statusText = 'running'
          break
        case 'passed':
          statusIcon = icons.pass
          statusColor = colors.green
          statusText = `passed (${file.duration}ms)`
          break
        case 'failed':
          statusIcon = icons.fail
          statusColor = colors.red
          statusText = `failed (${file.failed} errors)`
          break
        case 'skipped':
          statusIcon = icons.skip
          statusColor = colors.dim
          statusText = 'skipped'
          break
      }
      
      const fileDisplay = file.name.length > 35 ? file.name.slice(0, 32) + '...' : file.name
      console.log(`  ${statusColor}${statusIcon} ${fileDisplay.padEnd(35)} ${statusText}${colors.reset}`)
      
      // Show errors for failed files
      if (file.status === 'failed' && file.errors.length > 0) {
        file.errors.slice(0, 2).forEach(error => {
          const shortError = error.length > 60 ? error.slice(0, 57) + '...' : error
          console.log(`    ${colors.red}${colors.dim}└─ ${shortError}${colors.reset}`)
        })
        if (file.errors.length > 2) {
          console.log(`    ${colors.red}${colors.dim}└─ ... and ${file.errors.length - 2} more errors${colors.reset}`)
        }
      }
    })
    console.log()
  }

  private drawFooter() {
    if (this.suite.isRunning) {
      console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}`)
    } else {
      const totalTime = this.suite.totalDuration / 1000
      const passed = this.suite.files.filter(f => f.status === 'passed').length
      const failed = this.suite.files.filter(f => f.status === 'failed').length
      
      if (failed > 0) {
        console.log(`${colors.bgRed}${colors.white} ${icons.cross} Tests failed ${colors.reset} ${failed} failed, ${passed} passed in ${totalTime.toFixed(2)}s`)
      } else {
        console.log(`${colors.bgGreen}${colors.white} ${icons.check} All tests passed ${colors.reset} ${passed} passed in ${totalTime.toFixed(2)}s`)
      }
    }
  }

  private updateDisplay() {
    this.clearScreen()
    this.drawHeader()
    this.drawProgress()
    this.drawStats()
    this.drawFileList()
    this.drawFooter()
  }

  private parseVitestOutput(output: string, file: TestFile) {
    const lines = output.split('\n')
    
    for (const line of lines) {
      // Count test results
      if (line.includes('✓') || line.includes('PASS')) {
        file.passed++
        file.tests++
      } else if (line.includes('✗') || line.includes('FAIL')) {
        file.failed++
        file.tests++
        
        // Extract error message
        const errorMatch = line.match(/error:\s*(.+)/)
        if (errorMatch) {
          file.errors.push(errorMatch[1])
        }
      }
      
      // Extract duration
      const durationMatch = line.match(/\[(\d+(?:\.\d+)?)ms\]/)
      if (durationMatch) {
        file.duration = Math.max(file.duration, parseFloat(durationMatch[1]))
      }
    }
    
    // Update suite totals
    this.suite.totalTests = this.suite.files.reduce((sum, f) => sum + f.tests, 0)
    this.suite.totalPassed = this.suite.files.reduce((sum, f) => sum + f.passed, 0)
    this.suite.totalFailed = this.suite.files.reduce((sum, f) => sum + f.failed, 0)
  }

  async runTests(filePattern?: string) {
    this.suite.isRunning = true
    this.suite.startTime = Date.now()
    
    // Start display updates
    this.intervalId = setInterval(() => this.updateDisplay(), 100)
    this.updateDisplay()

    for (const file of this.suite.files) {
      if (filePattern && !file.name.includes(filePattern)) {
        file.status = 'skipped'
        continue
      }
      
      file.status = 'running'
      this.updateDisplay()
      
      try {
        const result = await this.runSingleTest(file)
        file.status = result.success ? 'passed' : 'failed'
        this.suite.totalDuration += file.duration
      } catch (error) {
        file.status = 'failed'
        file.errors.push(error instanceof Error ? error.message : String(error))
      }
      
      this.updateDisplay()
    }
    
    this.suite.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.updateDisplay()
    
    // Return exit code
    const hasFailures = this.suite.files.some(f => f.status === 'failed')
    process.exit(hasFailures ? 1 : 0)
  }

  private runSingleTest(file: TestFile): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const child = spawn('bun', ['test', file.path], {
        stdio: 'pipe',
        timeout: 30000 // 30 second timeout per file
      })
      
      let output = ''
      let errorOutput = ''
      
      child.stdout?.on('data', (data) => {
        const text = data.toString()
        output += text
        this.parseVitestOutput(text, file)
      })
      
      child.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      child.on('close', (code) => {
        if (errorOutput) {
          file.errors.push(errorOutput.slice(0, 200)) // Limit error length
        }
        resolve({ success: code === 0, output: output + errorOutput })
      })
      
      child.on('error', (error) => {
        file.errors.push(error.message)
        resolve({ success: false, output: error.message })
      })
      
      // Handle timeout
      setTimeout(() => {
        child.kill('SIGTERM')
        file.errors.push('Test timeout after 30 seconds')
        resolve({ success: false, output: 'Timeout' })
      }, 30000)
    })
  }
}

// Handle CLI arguments
const args = process.argv.slice(2)
const filePattern = args[0]

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}${icons.warn} Tests interrupted by user${colors.reset}`)
  process.exit(1)
})

// Run the tests
const runner = new CustomTestRunner()
runner.runTests(filePattern)