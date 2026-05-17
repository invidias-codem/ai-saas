import { RelayPoller } from './poller';

const userId = '00000000-0000-0000-0000-000000000000';
const deviceId = 'test-device';
const apiUrl = 'http://localhost:3000';

console.log(`Starting mock relay poller for device ${deviceId}...`);
const poller = new RelayPoller(apiUrl, userId, deviceId);

poller.start(2000);

process.on('SIGINT', () => {
    poller.stop();
    process.exit(0);
});
