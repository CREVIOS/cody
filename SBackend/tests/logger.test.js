/**
 * Logger Test Suite
 * Tests the structured logger service
 *
 * This test suite verifies that the Logger service correctly:
 * - Formats log entries with context
 * - Handles different log levels (debug, info, warn, error)
 * - Tracks metrics
 * - Respects silent mode in test environment
 * - Formats JSON output correctly
 *
 * Run with: node SBackend/tests/logger.test.js
 */

const { Logger } = require('../services/logger');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected "${str}" to include "${substr}"`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testsPassed++;
  }
}

// Capture console output
let consoleLogs = [];
let consoleWarns = [];
let consoleErrors = [];

function captureConsole() {
  consoleLogs = [];
  consoleWarns = [];
  consoleErrors = [];
  
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = (...args) => {
    consoleLogs.push(args);
    originalLog(...args);
  };
  
  console.warn = (...args) => {
    consoleWarns.push(args);
    originalWarn(...args);
  };
  
  console.error = (...args) => {
    consoleErrors.push(args);
    originalError(...args);
  };
  
  return () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  };
}

async function testLoggerInitialization() {
  console.log('\n📋 Test 1: Logger Initialization');
  console.log('='.repeat(60));

  const logger = new Logger();

  assert(logger.context !== undefined, 'Logger should have context');
  assert(logger.metrics !== undefined, 'Logger should have metrics Map');
  assert(typeof logger.silent === 'boolean', 'Logger should have silent flag');

  // Test with context
  const contextLogger = new Logger({ service: 'test', version: '1.0' });
  assert(contextLogger.context.service === 'test', 'Logger should store context');
  assert(contextLogger.context.version === '1.0', 'Logger should store all context fields');

  console.log('✓ Logger initialization test completed\n');
}

async function testLoggerFormat() {
  console.log('\n📋 Test 2: Logger Format');
  console.log('='.repeat(60));

  const logger = new Logger({ service: 'test' });
  const formatted = logger.format('info', 'Test message', { key: 'value' });

  // Should be valid JSON
  let parsed;
  try {
    parsed = JSON.parse(formatted);
  } catch (e) {
    assert(false, 'Formatted log should be valid JSON');
  }

  assert(parsed.level === 'info', 'Formatted log should include level');
  assert(parsed.message === 'Test message', 'Formatted log should include message');
  assert(parsed.service === 'test', 'Formatted log should include context');
  assert(parsed.key === 'value', 'Formatted log should include data');
  assert(parsed.timestamp !== undefined, 'Formatted log should include timestamp');

  console.log('✓ Logger format test completed\n');
}

async function testLoggerInfo() {
  console.log('\n📋 Test 3: Logger Info');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    logger.info('Test info message', { data: 'value' });
    
    assert(consoleLogs.length > 0, 'Info should log to console');
    const logStr = JSON.stringify(consoleLogs[0]);
    assertIncludes(logStr, 'Test info message', 'Info log should include message');
    assertIncludes(logStr, 'info', 'Info log should include level');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger info test completed\n');
}

async function testLoggerWarn() {
  console.log('\n📋 Test 4: Logger Warn');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    logger.warn('Test warning message', { warning: 'data' });
    
    assert(consoleWarns.length > 0, 'Warn should log to console.warn');
    const logStr = JSON.stringify(consoleWarns[0]);
    assertIncludes(logStr, 'Test warning message', 'Warn log should include message');
    assertIncludes(logStr, 'warn', 'Warn log should include level');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger warn test completed\n');
}

async function testLoggerError() {
  console.log('\n📋 Test 5: Logger Error');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    const testError = new Error('Test error');
    testError.code = 'TEST_ERROR';
    logger.error('Test error message', testError, { extra: 'data' });
    
    assert(consoleErrors.length > 0, 'Error should log to console.error');
    const logStr = JSON.stringify(consoleErrors[0]);
    assertIncludes(logStr, 'Test error message', 'Error log should include message');
    assertIncludes(logStr, 'error', 'Error log should include level');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger error test completed\n');
}

async function testLoggerDebug() {
  console.log('\n📋 Test 6: Logger Debug');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    // Debug should not log without LOG_LEVEL=debug
    logger.debug('Debug message', { data: 'value' });
    assert(consoleLogs.length === 0, 'Debug should not log without LOG_LEVEL=debug');
    
    // Set LOG_LEVEL=debug
    process.env.LOG_LEVEL = 'debug';
    logger.debug('Debug message 2', { data: 'value2' });
    assert(consoleLogs.length > 0, 'Debug should log with LOG_LEVEL=debug');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    restore();
  }

  console.log('✓ Logger debug test completed\n');
}

async function testLoggerSilentMode() {
  console.log('\n📋 Test 7: Logger Silent Mode');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    // Ensure we're in test mode
    process.env.NODE_ENV = 'test';
    
    // Clear any previous logs
    consoleLogs = [];
    consoleWarns = [];
    consoleErrors = [];
    
    const logger = new Logger({ service: 'test' });
    
    // In test mode, should be silent
    assert(logger.silent === true, 'Logger should be silent in test environment');
    
    logger.info('Should not log');
    logger.warn('Should not log');
    logger.error('Should not log', new Error('test'));
    
    // Should not have logged anything (logger methods check silent and return early)
    // Note: consoleLogs may contain output from other tests, so we check that our specific calls didn't log
    const hasOurLogs = consoleLogs.some(log => JSON.stringify(log).includes('Should not log'));
    const hasOurWarns = consoleWarns.some(warn => JSON.stringify(warn).includes('Should not log'));
    const hasOurErrors = consoleErrors.some(err => JSON.stringify(err).includes('Should not log'));
    
    assert(!hasOurLogs, 'Should not log in silent mode');
    assert(!hasOurWarns, 'Should not warn in silent mode');
    assert(!hasOurErrors, 'Should not error in silent mode');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger silent mode test completed\n');
}

async function testLoggerMetrics() {
  console.log('\n📋 Test 8: Logger Metrics');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    logger.metric('test.metric', 42, 'count', { tag: 'value' });
    
    // Should store metric
    assert(logger.metrics.has('test.metric'), 'Should store metric');
    const metrics = logger.metrics.get('test.metric');
    assert(metrics.length === 1, 'Should have one metric entry');
    assert(metrics[0].value === 42, 'Metric should have correct value');
    assert(metrics[0].unit === 'count', 'Metric should have correct unit');
    assert(metrics[0].tags.tag === 'value', 'Metric should have correct tags');
    
    // Add another metric
    logger.metric('test.metric', 100, 'count');
    assert(logger.metrics.get('test.metric').length === 2, 'Should accumulate metrics');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger metrics test completed\n');
}

async function testLoggerEvent() {
  console.log('\n📋 Test 9: Logger Event');
  console.log('='.repeat(60));

  const restore = captureConsole();
  const originalEnv = process.env.NODE_ENV;
  
  try {
    process.env.NODE_ENV = 'development';
    const logger = new Logger({ service: 'test' });
    
    logger.event('test.event', { eventData: 'value' });
    
    assert(consoleLogs.length > 0, 'Event should log');
    const logStr = JSON.stringify(consoleLogs[0]);
    assertIncludes(logStr, 'Event: test.event', 'Event log should include event name');
    assertIncludes(logStr, 'eventData', 'Event log should include event data');
    
    restore();
  } finally {
    process.env.NODE_ENV = originalEnv;
    restore();
  }

  console.log('✓ Logger event test completed\n');
}

async function testLoggerContextInheritance() {
  console.log('\n📋 Test 10: Logger Context Inheritance');
  console.log('='.repeat(60));

  const logger = new Logger({ service: 'test', version: '1.0' });
  const formatted = logger.format('info', 'Message', { extra: 'data' });
  const parsed = JSON.parse(formatted);

  // Should include all context fields
  assert(parsed.service === 'test', 'Should include context service');
  assert(parsed.version === '1.0', 'Should include context version');
  assert(parsed.extra === 'data', 'Should include data fields');

  console.log('✓ Logger context inheritance test completed\n');
}

// Run all tests
async function runAllTests() {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              LOGGER TEST SUITE                            ║');
  console.log('║              Testing: Structured Logger Service            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testLoggerInitialization();
    await testLoggerFormat();
    await testLoggerInfo();
    await testLoggerWarn();
    await testLoggerError();
    await testLoggerDebug();
    await testLoggerSilentMode();
    await testLoggerMetrics();
    await testLoggerEvent();
    await testLoggerContextInheritance();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('\n✅ ALL LOGGER TESTS PASSED!\n');
    return { testsPassed, testsFailed };
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error(error);
    throw error;
  }
}

// Export for Jest if running in Jest environment
if (typeof describe !== 'undefined') {
  describe('Logger', () => {
    it('passes the logger suite', async () => {
      const result = await runAllTests();
      expect(result.testsFailed).toBe(0);
    });
  });
}

// Allow running directly via Node for ad-hoc debugging
if (require.main === module) {
  runAllTests()
    .then((r) => {
      console.log(`Done: ${r.testsPassed} passed, ${r.testsFailed} failed`);
      process.exit(r.testsFailed > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

