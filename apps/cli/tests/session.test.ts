import { describe, expect, it } from 'vitest';

import {
  healthMatchesRecord,
  parseLinuxProcessSignature,
  parseProcessSignatureOutput,
  parseSessionRecord,
  parseWindowsProcessSignatureOutput,
} from '../src/cli/session.js';

const record = {
  artifact: {
    entryPath: '/tmp/artifact/src/index.tsx',
    name: '@open-artifacts/example',
    root: '/tmp/artifact',
    version: '1.0.0',
  },
  instanceId: 'instance-id',
  pid: 123,
  processSignature: {
    command: '/usr/bin/node runtime.js config.json secret-token',
    owner: '501',
    startedAt: 'Wed Jul 15 12:34:56 2026',
  },
  sessionId: 'session-id',
  startedAt: '2026-07-15T04:34:56.000Z',
  url: 'http://127.0.0.1:43127/',
};

describe('Session Record validation', () => {
  it('accepts the complete owned-process record', () => {
    expect(parseSessionRecord(record)).toEqual(record);
  });

  it.each([
    [{ ...record, instanceId: '' }],
    [{ ...record, pid: 0 }],
    [{ ...record, processSignature: { ...record.processSignature, command: '' } }],
    [{ ...record, url: 'https://example.com/' }],
  ])('rejects an unsafe record', (value) => {
    expect(parseSessionRecord(value)).toBeUndefined();
  });
});

describe('process and health ownership', () => {
  it('parses the macOS process identity fields without losing command arguments', () => {
    expect(
      parseProcessSignatureOutput(
        '  501 Wed Jul 15 12:34:56 2026 /usr/bin/node runtime.js config.json secret-token\n',
      ),
    ).toEqual(record.processSignature);
  });

  it('parses a Windows process identity with its owner SID and command line', () => {
    expect(
      parseWindowsProcessSignatureOutput(
        JSON.stringify({
          CommandLine: '"C:\\Program Files\\nodejs\\node.exe" runtime.js config.json secret-token',
          CreationDate: '20260715123456.123456+480',
          ExecutablePath: 'C:\\Program Files\\nodejs\\node.exe',
          OwnerSid: 'S-1-5-21-111-222-333-1001',
        }),
      ),
    ).toEqual({
      command: '"C:\\Program Files\\nodejs\\node.exe" runtime.js config.json secret-token',
      owner: 'S-1-5-21-111-222-333-1001',
      startedAt: '20260715123456.123456+480',
    });
  });

  it('parses a Linux procfs identity without depending on ps output', () => {
    const statFields = [
      'S',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '987654',
    ];

    expect(
      parseLinuxProcessSignature(
        `123 (node worker) ${statFields.join(' ')} 20 21\n`,
        'Name:\tnode\nUid:\t1000\t1000\t1000\t1000\n',
        '/usr/bin/node\0runtime.js\0config.json\0secret-token\0',
      ),
    ).toEqual({
      command: '/usr/bin/node\0runtime.js\0config.json\0secret-token',
      owner: '1000',
      startedAt: 'linux:987654',
    });
  });

  it('requires the Runtime health tuple to match the Session Record exactly', () => {
    expect(
      healthMatchesRecord(record, {
        artifact: '@open-artifacts/example',
        instanceId: 'instance-id',
        sessionId: 'session-id',
        status: 'active',
      }),
    ).toBe(true);
    expect(
      healthMatchesRecord(record, {
        artifact: '@open-artifacts/example',
        instanceId: 'different-instance',
        sessionId: 'session-id',
        status: 'active',
      }),
    ).toBe(false);
  });
});
