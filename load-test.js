import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const url = 'https://llm.gen1e.xyz/api/generate';
  const payload = JSON.stringify({
    model: 'qwen2.5:0.5b',
    prompt: 'Respond with a single word: hello.',
    stream: false,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency is under 5s': (r) => r.timings.duration < 5000,
  });

  sleep(1);
}
