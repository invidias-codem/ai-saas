import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
    // Scenario configuration
    scenarios: {
        // Constant concurrent users test
        constant_concurrent_users: {
            executor: 'constant-vus',
            vus: 10, // 10 concurrent users
            duration: '30s',
        },
        // Ramping load test
        ramping_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 20 }, // Ramp up to 20 users in 30s
                { duration: '1m', target: 20 },  // Stay at 20 users for 1 minute
                { duration: '30s', target: 0 },  // Ramp down to 0 in 30s
            ],
            gracefulRampDown: '30s',
            startTime: '30s', // Start after the first scenario
        },
        // Stress test
        stress_test: {
            executor: 'ramping-arrival-rate',
            startRate: 0,
            timeUnit: '1s',
            preAllocatedVUs: 50,
            maxVUs: 100,
            stages: [
                { duration: '2m', target: 100 }, // Ramp up to 100 RPS in 2 minutes
                { duration: '5m', target: 100 }, // Stay at 100 RPS for 5 minutes
                { duration: '2m', target: 0 },   // Ramp down to 0 in 2 minutes
            ],
            startTime: '2m30s', // Start after previous scenarios
        },
    },
    // Threshold settings
    thresholds: {
        http_req_duration: ['p(95)<4000'], // 95% of requests should complete within 4s
        http_req_failed: ['rate<0.1'],     // Error rate should be below 10%
        errors: ['rate<0.1'],               // Custom error rate should be below 10%
    },
};

// Environment variables
const API_URL = __ENV.API_URL || 'https://api.anycrawl.dev/v1/scrape';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'your-token-here';
const TARGET_URL = __ENV.TARGET_URL || 'https://example.com/';

export default function () {
    // Build request
    const payload = JSON.stringify({
        url: TARGET_URL,
        engine: 'playwright',
        formats: ['html'],
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        timeout: '30s',
    };

    // Send request
    const response = http.post(API_URL, payload, params);

    // Check response
    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'response has data': (r) => r.json('data') !== null,
        'response time < 4s': (r) => r.timings.duration < 4000,
    });

    // Record errors
    errorRate.add(!success);

    // Simulate user think time
    sleep(1);
}

// Lifecycle hooks
export function handleSummary(data) {
    return {
        'summary.json': JSON.stringify(data),
        'summary.txt': textSummary(data, { indent: ' ', enableColors: true }),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}

function textSummary(data, options) {
    // Simplified text summary (in real use, import k6's textSummary)
    return `
Test Summary:
  Total Requests: ${data.metrics.http_reqs.values.count}
  Failed Requests: ${data.metrics.http_req_failed.values.passes}
  Average Duration: ${data.metrics.http_req_duration.values.avg}ms
  P95 Duration: ${data.metrics.http_req_duration.values['p(95)']}ms
  Error Rate: ${data.metrics.errors.values.rate * 100}%
`;
} 