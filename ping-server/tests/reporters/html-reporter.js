/**
 * Custom HTML Test Reporter for Jest
 * 
 * Generates an HTML report with test results, security findings,
 * and coverage summary.
 */
const fs = require('fs');
const path = require('path');

class HtmlReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options;
  }

  onRunComplete(contexts, results) {
    const reportDir = path.join(process.cwd(), 'test-reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `test-report-${timestamp}.html`);
    const latestPath = path.join(reportDir, 'latest-report.html');

    // Collect data
    const totalSuites = results.numTotalTestSuites;
    const passedSuites = results.numPassedTestSuites;
    const failedSuites = results.numFailedTestSuites;
    const totalTests = results.numTotalTests;
    const passedTests = results.numPassedTests;
    const failedTests = results.numFailedTests;
    const skippedTests = results.numPendingTests;
    const duration = ((results.testResults || []).reduce((sum, r) => sum + (r.perfStats?.end - r.perfStats?.start || 0), 0) / 1000).toFixed(2);

    // Security warnings from console output
    const warnings = [];
    for (const suite of results.testResults) {
      for (const test of suite.testResults) {
        if (test.status === 'passed' || test.status === 'failed') {
          const consoleOutput = (suite.console || []).map(c => c.message).join('\n');
          if (consoleOutput.includes('SECURITY WARNING')) {
            const matches = consoleOutput.match(/⚠️\s*SECURITY WARNING:.+/g);
            if (matches) warnings.push(...matches);
          }
        }
      }
    }

    // Build suite results
    const suiteRows = [];
    for (const suite of results.testResults) {
      const suiteName = path.relative(process.cwd(), suite.testFilePath);
      const passed = suite.testResults.filter(t => t.status === 'passed').length;
      const failed = suite.testResults.filter(t => t.status === 'failed').length;
      const skipped = suite.testResults.filter(t => t.status === 'pending').length;
      const suiteStatus = failed > 0 ? 'FAIL' : 'PASS';
      const suiteDuration = ((suite.perfStats?.end - suite.perfStats?.start || 0) / 1000).toFixed(2);
      
      suiteRows.push({ suiteName, passed, failed, skipped, suiteStatus, suiteDuration, tests: suite.testResults });
    }

    const html = this.generateHtml({
      timestamp: new Date().toISOString(),
      totalSuites, passedSuites, failedSuites,
      totalTests, passedTests, failedTests, skippedTests,
      duration, warnings, suiteRows,
    });

    fs.writeFileSync(reportPath, html);
    fs.writeFileSync(latestPath, html);

    // Also write a JSON summary
    const jsonSummary = {
      timestamp: new Date().toISOString(),
      summary: { totalSuites, passedSuites, failedSuites, totalTests, passedTests, failedTests, skippedTests, duration },
      securityWarnings: warnings,
      suites: suiteRows.map(s => ({
        name: s.suiteName,
        status: s.suiteStatus,
        passed: s.passed,
        failed: s.failed,
        skipped: s.skipped,
        duration: s.suiteDuration,
        failedTests: s.tests.filter(t => t.status === 'failed').map(t => ({
          name: t.fullName,
          error: t.failureMessages?.join('\n'),
        })),
      })),
    };
    fs.writeFileSync(path.join(reportDir, 'test-results.json'), JSON.stringify(jsonSummary, null, 2));

    console.log(`\n📊 HTML Report: ${reportPath}`);
    console.log(`📊 Latest Report: ${latestPath}`);
    console.log(`📊 JSON Results: ${path.join(reportDir, 'test-results.json')}`);
  }

  generateHtml(data) {
    const passRate = data.totalTests > 0 ? ((data.passedTests / data.totalTests) * 100).toFixed(1) : 0;
    const statusColor = data.failedTests === 0 ? '#22c55e' : '#ef4444';
    const statusText = data.failedTests === 0 ? 'ALL TESTS PASSED' : `${data.failedTests} TEST(S) FAILED`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StealthDash Test Report</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --card: #111118;
      --border: #1e1e2e;
      --text: #e2e8f0;
      --text-dim: #94a3b8;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
      --blue: #3b82f6;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-dim); margin-bottom: 2rem; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
    }
    .summary-card .label { color: var(--text-dim); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 2rem; font-weight: 700; margin-top: 0.25rem; }
    .summary-card .value.green { color: var(--green); }
    .summary-card .value.red { color: var(--red); }
    .summary-card .value.yellow { color: var(--yellow); }
    .summary-card .value.blue { color: var(--blue); }

    .status-banner {
      background: var(--card);
      border: 2px solid ${statusColor};
      border-radius: 12px;
      padding: 1rem 1.5rem;
      text-align: center;
      font-size: 1.2rem;
      font-weight: 700;
      color: ${statusColor};
      margin-bottom: 2rem;
    }

    .warnings {
      background: #1a1500;
      border: 1px solid #433a00;
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }
    .warnings h2 { color: var(--yellow); font-size: 1.1rem; margin-bottom: 0.5rem; }
    .warnings ul { padding-left: 1.5rem; }
    .warnings li { color: var(--yellow); margin-bottom: 0.25rem; font-size: 0.9rem; }

    .suite {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .suite-header {
      padding: 1rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    .suite-header:hover { background: rgba(255,255,255,0.02); }
    .suite-name { font-weight: 600; font-size: 0.95rem; }
    .suite-meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--text-dim); }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.pass { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge.fail { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge.skip { background: rgba(234,179,8,0.15); color: var(--yellow); }

    .suite-tests { display: none; padding: 0; }
    .suite.open .suite-tests { display: block; }
    .test-row {
      padding: 0.6rem 1.25rem 0.6rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 0.88rem;
    }
    .test-row:last-child { border-bottom: none; }
    .test-name { flex: 1; }
    .test-status { width: 60px; text-align: right; font-weight: 600; }
    .test-status.passed { color: var(--green); }
    .test-status.failed { color: var(--red); }
    .test-status.pending { color: var(--yellow); }
    .error-msg {
      padding: 0.5rem 1.25rem 0.8rem 2rem;
      background: rgba(239,68,68,0.05);
      font-family: 'Fira Code', monospace;
      font-size: 0.8rem;
      color: var(--red);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }

    .footer {
      text-align: center;
      color: var(--text-dim);
      font-size: 0.8rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛡️ StealthDash Test Report</h1>
    <p class="subtitle">Generated: ${data.timestamp} | Duration: ${data.duration}s</p>

    <div class="status-banner">${statusText} — ${passRate}% Pass Rate</div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Tests</div>
        <div class="value blue">${data.totalTests}</div>
      </div>
      <div class="summary-card">
        <div class="label">Passed</div>
        <div class="value green">${data.passedTests}</div>
      </div>
      <div class="summary-card">
        <div class="label">Failed</div>
        <div class="value red">${data.failedTests}</div>
      </div>
      <div class="summary-card">
        <div class="label">Skipped</div>
        <div class="value yellow">${data.skippedTests}</div>
      </div>
      <div class="summary-card">
        <div class="label">Suites</div>
        <div class="value blue">${data.totalSuites}</div>
      </div>
      <div class="summary-card">
        <div class="label">Duration</div>
        <div class="value">${data.duration}s</div>
      </div>
    </div>

    ${data.warnings.length > 0 ? `
    <div class="warnings">
      <h2>⚠️ Security Warnings (${data.warnings.length})</h2>
      <ul>
        ${data.warnings.map(w => `<li>${this.escapeHtml(w)}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}

    <h2 style="margin-bottom: 1rem; font-size: 1.2rem;">Test Suites</h2>

    ${data.suiteRows.map(suite => `
    <div class="suite" onclick="this.classList.toggle('open')">
      <div class="suite-header">
        <span class="suite-name">
          <span class="badge ${suite.suiteStatus === 'PASS' ? 'pass' : 'fail'}">${suite.suiteStatus}</span>
          &nbsp; ${this.escapeHtml(suite.suiteName)}
        </span>
        <span class="suite-meta">
          <span style="color: var(--green)">${suite.passed} passed</span>
          ${suite.failed > 0 ? `<span style="color: var(--red)">${suite.failed} failed</span>` : ''}
          ${suite.skipped > 0 ? `<span style="color: var(--yellow)">${suite.skipped} skipped</span>` : ''}
          <span>${suite.suiteDuration}s</span>
        </span>
      </div>
      <div class="suite-tests">
        ${suite.tests.map(t => `
        <div class="test-row">
          <span class="test-name">${this.escapeHtml(t.fullName || t.title)}</span>
          <span class="test-status ${t.status}">${t.status === 'passed' ? '✓' : t.status === 'failed' ? '✗' : '○'} ${t.status}</span>
        </div>
        ${t.status === 'failed' && t.failureMessages?.length ? `<div class="error-msg">${this.escapeHtml(t.failureMessages.join('\n'))}</div>` : ''}
        `).join('')}
      </div>
    </div>`).join('')}

    <div class="footer">
      StealthDash Testing Suite — Covering ${data.totalTests} tests across ${data.totalSuites} suites
    </div>
  </div>
</body>
</html>`;
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = HtmlReporter;
