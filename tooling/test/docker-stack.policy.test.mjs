import { describe, expect, it } from 'vitest';
import {
  apiUpArgs,
  detachedStackUpArgs,
  findNativeWslDockerMismatches,
} from '../scripts/docker-stack.policy.mjs';

const nativeWslEngine = {
  isWsl: true,
  context: 'default',
  endpoint: 'unix:///var/run/docker.sock',
  daemonName: 'JunniorOffice',
  dockerRootDir: '/var/lib/docker',
  hostname: 'JunniorOffice',
  dockerHostOverride: undefined,
  dockerContextOverride: undefined,
};

describe('local Docker stack policy', () => {
  it('starts the API detached and waits for its health gate', () => {
    expect(apiUpArgs).toEqual([
      'up',
      '-d',
      '--build',
      '--wait',
      '--wait-timeout',
      '120',
      'postgres',
      'api',
    ]);
  });

  it('starts the full stack detached and waits for health', () => {
    expect(detachedStackUpArgs).toEqual([
      'up',
      '-d',
      '--no-build',
      '--wait',
      '--wait-timeout',
      '120',
      'postgres',
      'api',
      'web',
      'worker',
      'processor',
      'control',
    ]);
  });

  it('accepts the native WSL Docker engine', () => {
    expect(findNativeWslDockerMismatches(nativeWslEngine)).toEqual([]);
  });

  it('rejects split-brain WSL Docker state', () => {
    expect(
      findNativeWslDockerMismatches({
        ...nativeWslEngine,
        context: 'desktop-linux',
        endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
        daemonName: 'docker-desktop',
        dockerRootDir: '/var/lib/docker-desktop',
        dockerHostOverride: 'tcp://localhost:2375',
        dockerContextOverride: 'desktop-linux',
      }),
    ).toEqual([
      'Docker context is "desktop-linux"; expected "default".',
      'Docker endpoint is "npipe:////./pipe/dockerDesktopLinuxEngine"; expected "unix:///var/run/docker.sock".',
      'Docker daemon is "docker-desktop"; expected native WSL daemon "JunniorOffice".',
      'Docker root is "/var/lib/docker-desktop"; expected "/var/lib/docker".',
      'DOCKER_HOST overrides the native WSL socket.',
      'DOCKER_CONTEXT is "desktop-linux"; expected "default".',
    ]);
  });

  it('does not constrain Docker on non-WSL hosts', () => {
    expect(
      findNativeWslDockerMismatches({
        ...nativeWslEngine,
        isWsl: false,
        context: 'desktop-linux',
        endpoint: 'unexpected',
        daemonName: 'docker-desktop',
        dockerRootDir: '/unexpected',
        dockerHostOverride: 'unexpected',
        dockerContextOverride: 'unexpected',
      }),
    ).toEqual([]);
  });
});
