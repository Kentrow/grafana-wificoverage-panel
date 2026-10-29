// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const base = require('./.config/jest.config');

const TS_PATTERN = '^.+\\.(t|j)sx?$';
const [transformer, swcOptions] = base.transform[TS_PATTERN];

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...base,
  transform: {
    ...base.transform,
    // Same target as the webpack build. SWC defaults to ES5, which makes the radio model many times
    // slower than in Grafana and the performance tests meaningless.
    [TS_PATTERN]: [transformer, { ...swcOptions, jsc: { ...swcOptions.jsc, target: 'es2015' } }],
  },
};
