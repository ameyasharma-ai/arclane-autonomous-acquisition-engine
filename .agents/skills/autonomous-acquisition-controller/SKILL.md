---
name: autonomous-acquisition-controller
description: Autonomously operates and monitors the Arclane 12-Hour Autopilot engine, managing micro-locality hopping across Patna/Bihar, automated website deployments, and boundary exhaustion safeguards.
---

# Autonomous Acquisition Controller Skill

This skill enables Antigravity to autonomously manage, monitor, and instruct the Arclane Autonomous Acquisition Engine for batch client generation, micro-locality exploration, and website deployment.

## Core Capabilities

1. **12-Hour Autopilot Control**:
   - Start, pause, or resume the 12-hour session with safe timeout caps.
   - Monitor the background pipeline runner and report live status.
   - Generate structured end-of-run executive summaries.

2. **Locality Hopping & Boundary Exhaustion**:
   - Interacts with `LocalityEngine` (`src/engine/locality_engine.js`) and `config/geo_hierarchy.json`.
   - Checks `data/locality_coverage.json` to prevent over-scraping any single locality.
   - Automatically hops to the next available locality when yield drops below threshold (e.g. < 5 leads).

3. **Instant Maps URL Deployment**:
   - Directly synthesizes and deploys a single Google Maps business link via `pipelineRunner.buildFromMapsUrl(url)` without manual sheet configuration.

## Common Operations

### 1. Starting Locality Exploration Chain
Run a multi-locality search for a specific niche and target lead volume:
```javascript
const { pipelineRunner } = require('./controller_bot/pipeline_runner.js');
await pipelineRunner.runLocalityChain({
  query: 'Gyms',
  city: 'Patna',
  state: 'Bihar',
  targetTotal: 33
});
```

### 2. Checking Coverage & Saturation
View how many leads have been harvested across all micro-localities:
```javascript
const { LocalityEngine } = require('./src/engine/locality_engine.js');
const engine = new LocalityEngine();
console.log(engine.getCoverageReport('Gyms', 'Patna'));
```

### 3. Deploying Single Business Link
Deploy a website directly from a Google Maps URL:
```javascript
const { pipelineRunner } = require('./controller_bot/pipeline_runner.js');
await pipelineRunner.buildFromMapsUrl('https://maps.app.goo.gl/...');
```

## Guardrails & Best Practices
- **Rate Limits**: Honor the 12-hour session maximum.
- **Deduplication**: Always check existing `Client ID` and phone numbers before appending new rows to Google Sheets.
- **Clock Drift**: Rely on `sheets.js` clock synchronization against `https://www.googleapis.com` to prevent JWT expiration errors.
- **Auto-Commit**: Always run `node scripts/auto_commit.js` after batch operations or major code updates.
