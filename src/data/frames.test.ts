import { createDataFrame, FieldType } from '@grafana/data';
import { joinFrames, parseBand, roleOf } from './frames';

/** A Prometheus time series frame, as the data source returns it for one series. */
const series = (refId: string, labels: Record<string, string>, values: Array<number | null>) =>
  createDataFrame({
    refId,
    fields: [
      { name: 'Time', type: FieldType.time, values: values.map((_, i) => 1000 * i) },
      { name: 'Value', type: FieldType.number, values, labels },
    ],
  });

describe('roleOf', () => {
  it('recognises metric names whatever the prefix', () => {
    expect(roleOf('aruba_ap_info')).toBe('info');
    expect(roleOf('aruba_radio_tx_power_dbm')).toBe('txPower');
    expect(roleOf('unifi_ap_up')).toBe('up');
    expect(roleOf('txPower')).toBe('txPower');
    expect(roleOf('A')).toBeUndefined();
  });
});

describe('parseBand', () => {
  it('reads the usual spellings', () => {
    expect(parseBand('2.4GHz')).toBe('2.4GHz');
    expect(parseBand('5 GHz')).toBe('5GHz');
    expect(parseBand('6GHz')).toBe('6GHz');
    expect(parseBand('60GHz')).toBe('6GHz');
    expect(parseBand(undefined)).toBeUndefined();
  });
});

describe('joinFrames', () => {
  it('joins time series frames by ap and keeps the last value', () => {
    const { aps, roles } = joinFrames([
      series('A', { __name__: 'aruba_ap_info', ap: 'ap-2', x: '0.5', y: '0.25', model: 'AP-635' }, [1]),
      series('A', { __name__: 'aruba_ap_info', ap: 'ap-10', x: '0.1', y: '0.9', model: 'AP-535' }, [1]),
      series('B', { __name__: 'aruba_ap_up', ap: 'ap-2' }, [1, 1, 0]),
      series('C', { __name__: 'aruba_radio_tx_power_dbm', ap: 'ap-2', band: '5GHz' }, [15, 17, null]),
      series('C', { __name__: 'aruba_radio_tx_power_dbm', ap: 'ap-10', band: '2.4GHz' }, [9]),
      series('D', { __name__: 'aruba_radio_channel', ap: 'ap-2', band: '5GHz' }, [36]),
    ]);
    expect(roles).toEqual(new Set(['info', 'up', 'txPower', 'channel']));
    expect(aps.map((a) => a.name)).toEqual(['ap-2', 'ap-10']);
    expect(aps[0]).toMatchObject({
      x: 0.5,
      y: 0.25,
      up: false,
      model: 'AP-635',
      radios: { '5GHz': { txPowerDbm: 17, channel: 36 } },
    });
    expect(aps[1]).toMatchObject({ up: true, radios: { '2.4GHz': { txPowerDbm: 9 } } });
    expect(aps[1].radios['6GHz']).toBeUndefined();
  });

  it('falls back on the refId when aggregation dropped __name__', () => {
    const { aps } = joinFrames([
      series('info', { ap: 'ap-1', x: '0.2', y: '0.2' }, [1]),
      series('aruba_radio_tx_power_dbm', { ap: 'ap-1', band: '6GHz' }, [14]),
    ]);
    expect(aps[0].radios['6GHz']?.txPowerDbm).toBe(14);
  });

  it('reads table format frames from instant queries', () => {
    const table = createDataFrame({
      refId: 'A',
      fields: [
        { name: 'Time', type: FieldType.time, values: [0, 0] },
        { name: '__name__', type: FieldType.string, values: ['aruba_ap_info', 'aruba_ap_info'] },
        { name: 'ap', type: FieldType.string, values: ['ap-1', 'ap-2'] },
        { name: 'x', type: FieldType.string, values: ['0.1', '0.9'] },
        { name: 'y', type: FieldType.string, values: ['0.5', '0.5'] },
        { name: 'Value #A', type: FieldType.number, values: [1, 1] },
      ],
    });
    const up = createDataFrame({
      refId: 'aruba_ap_up',
      fields: [
        { name: 'Time', type: FieldType.time, values: [0, 0] },
        { name: 'ap', type: FieldType.string, values: ['ap-1', 'ap-2'] },
        { name: 'Value #B', type: FieldType.number, values: [1, 0] },
      ],
    });
    const { aps } = joinFrames([table, up]);
    expect(aps.map((a) => [a.name, a.x, a.up])).toEqual([
      ['ap-1', 0.1, true],
      ['ap-2', 0.9, false],
    ]);
  });

  it('keeps APs without a position, to be placed by hand', () => {
    const { aps } = joinFrames([series('A', { __name__: 'aruba_ap_info', ap: 'ap-1' }, [1])]);
    expect(aps.map((a) => [a.name, a.x, a.y])).toEqual([['ap-1', undefined, undefined]]);
  });

  it('takes the APs from the info series when there is one', () => {
    const { aps } = joinFrames([
      series('A', { __name__: 'aruba_ap_info', ap: 'ap-1', x: '0.1', y: '0.1' }, [1]),
      series('C', { __name__: 'aruba_radio_tx_power_dbm', ap: 'other-floor', band: '5GHz' }, [15]),
    ]);
    expect(aps.map((a) => a.name)).toEqual(['ap-1']);
  });

  it('makes APs from any series without an info series', () => {
    const { aps } = joinFrames([
      series('C', { __name__: 'aruba_radio_tx_power_dbm', ap: 'ap-1', band: '5GHz' }, [15]),
      series('B', { __name__: 'aruba_ap_up', ap: 'ap-2' }, [0]),
    ]);
    expect(aps.map((a) => [a.name, a.up, a.x])).toEqual([
      ['ap-1', true, undefined],
      ['ap-2', false, undefined],
    ]);
    expect(aps[0].radios['5GHz']?.txPowerDbm).toBe(15);
  });
});
