// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';
import { clearImmediate, setImmediate } from 'timers';

// jsdom has no setImmediate, so React's scheduler falls back on the MessageChannel from worker_threads,
// whose port stays open and keeps Jest from exiting when the tests run in band. With setImmediate it
// schedules as it does in Node.
Object.assign(global, { setImmediate, clearImmediate });
