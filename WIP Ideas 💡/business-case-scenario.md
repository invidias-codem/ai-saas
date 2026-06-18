# Business Case Scenario: Acme Analytics × Lattice OS

## The Setup: Acme Analytics

**Company:** Acme Analytics (mid-size B2B SaaS, 85 employees, $12M ARR)  
**Product:** Data visualization platform for enterprise clients  
**Pain Point:** Customer support team drowning in context-switching

### The Problem

Acme's support agents handle 400+ tickets daily across Slack, email, and in-app chat. Every ticket requires:
- Loading customer context (which plan, feature flags, recent interactions)
- Reviewing past tickets (what did they ask before, what solutions worked)
- Checking internal knowledge base (is there documentation for this?)
- Pulling product data (what dashboards are they using, what's their data volume)

**Current state:**
- Average ticket resolution: 18 minutes
- Agent context-switching: 6-8 tools per ticket
- Knowledge gap: New agents take 6 months to match senior agent performance
- Customer frustration: Repeating themselves across multiple interactions

**Cost impact:**
- 15 support agents × $85K salary = $1.275M/year
- 18 min/ticket × 400 tickets/day = 7200 min/day = 120 hours/day
- 30% of time is context-gathering, not problem-solving

### The Pitch

Your sales rep gets the warm intro:

> *"We've been working on a memory layer that learns from every customer interaction. Imagine your support agents never having to dig through history — the system surfaces the right context before they even finish reading the ticket. We're doing a design partner program with 3 companies. Interested in a 15-minute demo?"*

**Demo highlights:**
1. Agent opens ticket → Lattice OS surfaces customer's last 3 interactions
2. Agent sees: *"This customer asked about data retention 2 weeks ago, prefers visual explanations, is on Enterprise plan with custom data sources"*
3. Agent asks Lattice: *"How do we export data from custom data sources?"* → Gets ranked docs + past solutions
4. Agent resolves ticket in 8 minutes instead of 18

**Acme's CTO:** *"Okay, but how does this work with our existing stack? We're not swapping out Zendesk."*

**Your response:** *"You don't. Lattice OS runs in your infrastructure as a Docker container. Your apps call our API like any other service. We're not a replacement — we're a memory layer."*

---

## The Integration: 6-Week Pilot

### Week 1: Deployment + Licensing

**Acme's DevOps engineer:**

```bash
# Pull the Lattice OS container
docker pull lattice-os/lattice:2026.06

# Spin up the stack (lattice + postgres + redis)
docker-compose up -d
```

**Startup logs:**
```
✅ Lattice OS container started (instance: 7f8e9d2a)
✅ Postgres + pgvector ready (1.2GB allocated)
✅ UCOL embedding service ready (dimension: 768)
⏳ Awaiting license activation...
```

**Activation wizard:**
```
┌─────────────────────────────────────┐
│  Lattice OS — First-Time Setup      │
├─────────────────────────────────────┤
│  Paste your license key:            │
│  [LATOS-ENT-ACME-2026-...]          │
│                                     │
│  [ Activate ]                       │
└─────────────────────────────────────┘
```

**Response:**
```json
{
  "success": true,
  "license": {
    "tier": "enterprise",
    "features": ["sso:saml", "rbac", "multi_node"],
    "maxNodes": 3,
    "maxSeats": 5,
    "organization": "Acme Analytics",
    "expiresAt": "2027-06-16T00:00:00Z"
  }
}
```

**DevOps:** *"Cool, it's running. How do I connect our apps?"*

---

### Week 2: API Key + First Query

**Acme's backend engineer creates a partner key:**

1. Logs into Acme's Lattice dashboard at `https://lattice.acme.internal/settings/partner-keys`
2. Clicks "Create Key"
3. Fills in:
   - Name: "Zendesk Integration"
   - Workspace: "Customer Support"
   - Environment: test
   - Scopes: memory:read, query:read
4. Gets key: `lat_test_a1b2c3d4e5f6...` (shows once)

**First test in Python:**

```python
import requests

key = "lat_test_a1b2c3d4e5f6..."
headers = {"Authorization": f"Bearer {key}"}

# Test the health endpoint
resp = requests.get("https://lattice.acme.internal/api/v1/health", headers=headers)
print(resp.json())
# {"ok": True, "service": "Lattice OS Partner Gateway", "version": "v1"}

# Query memories (empty for now)
resp = requests.post(
    "https://lattice.acme.internal/api/v1/query",
    headers=headers,
    json={"query": "How do I export CSV data?", "limit": 5}
)
print(resp.json())
# {"results": [], "query": "How do I export CSV data?", "total": 0}
```

**Backend engineer:** *"Okay, it's working but empty. How do we load data?"*

---

### Week 3: Ingesting Customer History

**Acme runs a backfill script:**

```python
from lattice import LatticeClient
import requests

client = LatticeClient(
    api_key="lat_test_a1b2c3d4e5f6...",
    base_url="https://lattice.acme.internal"
)

# Fetch last 6 months of Zendesk tickets
zendesk_tickets = requests.get(
    "https://acme.zendesk.com/api/v2/tickets",
    auth=("agent@acme.com", "ZENDESK_TOKEN"),
    params={"page[size]": 100, "sort_by": "created_at", "sort_order": "desc"}
)["tickets"]

print(f"Ingesting {len(zendesk_tickets)} tickets...")

for ticket in zendesk_tickets[:5000]:  # Backfill 5K tickets
    # Build memory content
    content = f"""
Customer: {ticket['requester']['name']} ({ticket['requester']['email']})
Company: {ticket['organization']['name']}
Subject: {ticket['subject']}
Status: {ticket['status']}
Priority: {ticket['priority']}

Problem:
{ticket['description']}

Resolution:
{ticket['comments'][-1]['body'] if ticket['comments'] else 'Unresolved'}
"""
    
    # Store in Lattice (workspace-scoped)
    client.memory.write(
        content=content,
        type="conversation_summary",
        metadata={
            "source": "zendesk",
            "ticket_id": ticket['id'],
            "customer_id": ticket['requester']['id'],
            "created_at": ticket['created_at'],
            "tags": ticket['tags'],
        }
    )

print("✅ Backfill complete")
```

**Result:**
- 5,000 tickets ingested
- ~15MB of vector embeddings generated
- Average latency: 200ms per write

---

### Week 4: Support Agent Integration

**Acme's frontend engineer builds a browser extension:**

```javascript
// Chrome extension: inject Lattice context into Zendesk UI
const LATOS_KEY = "lat_test_a1b2c3d4e5f6...";
const LATOS_URL = "https://lattice.acme.internal/api/v1";

function getCustomerContext(ticketId) {
  // Extract ticket info from DOM
  const subject = document.querySelector('.ticket-subject').innerText;
  const description = document.querySelector('.ticket-description').innerText;
  
  // Ask Lattice: "What do we know about this customer?"
  fetch(`${LATOS_URL}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LATOS_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `${subject}\n\n${description}`,
      limit: 3,
      include_scores: true
    })
  })
  .then(res => res.json())
  .then(data => {
    // Inject context panel
    document.querySelector('.context-panel').innerHTML = `
      <h3>Customer History</h3>
      ${data.results.map(r => `
        <div class="memory-card">
          <div class="similarity">${(r.similarity * 100).toFixed(0)}% match</div>
          <div class="content">${r.content}</div>
        </div>
      `).join('')}
    `;
  });
}

// Trigger on ticket load
new MutationObserver((mutations) => {
  if (document.querySelector('.ticket-container')) {
    getCustomerContext();
  }
}).observe(document.body, { childList: true, subtree: true });
```

**Support agent opens a ticket:**

```
Subject: "Can't export my dashboard data"
Description: "I'm trying to download my Q3 sales data but the CSV button isn't working..."

[Context panel loads in 180ms]

Customer History:
┌─────────────────────────────────────┐
│ 92% match                           │
│ Ticket #4821 (3 weeks ago)          │
│ Customer asked about data retention │
│ Solution: "Go to Settings → Data    │
│ Retention, increase to 90 days"     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 87% match                           │
│ Ticket #4756 (2 months ago)         │
│ Export button was disabled          │
│ Solution: "You need 'export'        │
│ permission. Contact your admin."    │
└─────────────────────────────────────┘
```

**Agent's internal monologue:** *"Okay, this customer had an export issue before. Let me check their current permissions."*

**Resolution time:** 6 minutes (down from 18)

---

### Week 5: Webhook Integration (Real-Time Updates)

**Acme registers a webhook:**

```python
# When a support agent closes a ticket, push resolution to Lattice
resp = requests.post(
    "https://lattice.acme.internal/api/v1/webhooks",
    headers={"Authorization": f"Bearer {LATOS_KEY}"},
    json={
        "endpoint_url": "https://acme-webhooks.fly.io/lattice-tickets",
        "events": ["ticket.closed"],
        "description": "Sync closed tickets back to Lattice"
    }
)

webhook = resp.json()
print(f"Webhook created: {webhook['id']}")
print(f"Signing secret: {webhook['signing_secret']}")
# lat_test_a1b2... (save this, won't see again)
```

**Acme's webhook handler:**

```python
from flask import Flask, request
import hmac, hashlib

app = Flask(__name__)
SIGNING_SECRET = "lwhsec_abc123..."

@app.route('/lattice-tickets', methods=['POST'])
def handle_ticket_closed():
    # Verify signature
    signature = request.headers.get('X-Lattice-Signature')
    timestamp = request.headers.get('X-Lattice-Timestamp')
    
    body = request.data.decode('utf-8')
    expected_sig = hmac.new(
        SIGNING_SECRET.encode(),
        f"{timestamp}.{body}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, f"v1={expected_sig}"):
        return "Invalid signature", 401
    
    # Parse event
    event = request.json()
    if event['type'] == 'ticket.closed':
        ticket_id = event['data']['ticket_id']
        resolution = event['data']['resolution']
        
        # Push resolution back to Lattice
        client.memory.write(
            content=f"Ticket {ticket_id} resolved: {resolution}",
            type="fact",
            metadata={"source": "zendesk", "ticket_id": ticket_id}
        )
    
    return "OK", 200
```

**Result:** Every closed ticket automatically enriches the knowledge base.

---

### Week 6: Production Rollout + Metrics

**Acme switches to live key:**

```python
# Generate live key (higher rate limit)
client = LatticeClient(
    api_key="lat_live_f8e7d6c5b4a3...",  # 1000 req/min
    base_url="https://lattice.acme.internal"
)
```

**Dashboard metrics (Month 1):**

| Metric | Before Lattice | After Lattice | Δ |
|--------|----------------|---------------|---|
| Avg ticket resolution | 18 min | 11 min | -39% |
| Agent context-switching | 6-8 tools | 2 tools | -75% |
| New agent ramp-up | 6 months | 3 months | -50% |
| Customer CSAT | 4.1/5 | 4.6/5 | +12% |

**Cost savings:**
- 120 hours/day × 30% time saved = 36 hours/day
- 36 hours/day × $50/hr (burdened cost) = $1,800/day saved
- $1,800 × 365 = **$657K/year savings**

**ROI:**
- Pilot cost: $8,000 (flat fee)
- Annual license: $24,000 (3 nodes × $8K/node)
- Total Year 1: $32,000
- **Payback period: 17 days**

---

## The Upsell: Year 2 Expansion

**Acme's CTO calls you:**

> *"This is working really well for support. Can we use this for our sales team? They need to remember every interaction with prospects."*

**Your response:** *"Absolutely. You can spin up a second workspace for Sales, or we can scale your existing license to 10 nodes. What's your headcount?"*

**Acme:** *"Sales is 30 people, but we also want to use this for customer success. Can we get SSO so we don't manage individual logins?"*

**You:** *"SSO is included in your Enterprise license. You can deploy to 10 nodes without a license upgrade. If you need more than that, we can discuss a cluster license."*

**Result:**
- Year 2: 10-node license ($80K)
- Year 3: 50-node license + custom Lattice-1 fine-tune ($200K)

---

## Key Takeaways

1. **Integration friction matters** — Docker appliance + Python SDK = 2-week integration
2. **Workspace isolation is a feature** — Support team's data never contaminates Sales
3. **Webhooks enable network effects** — Every closed ticket enriches the knowledge base
4. **Metrics drive expansion** — "39% faster resolution" is an easy C-suite pitch
5. **License keys scale with the customer** — Community → Business → Enterprise → Cluster

**This is how you turn a $8K pilot into a $200K/year contract.**
