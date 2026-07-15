export const localStackServices = Object.freeze([
  'postgres',
  'api',
  'web',
  'worker',
  'processor',
]);

export const apiUpArgs = Object.freeze([
  'up',
  '-d',
  '--build',
  '--wait',
  '--wait-timeout',
  '120',
  'postgres',
  'api',
]);

export const detachedStackUpArgs = Object.freeze([
  'up',
  '-d',
  '--no-build',
  '--wait',
  '--wait-timeout',
  '120',
  ...localStackServices,
]);

export const findNativeWslDockerMismatches = ({
  isWsl,
  context,
  endpoint,
  daemonName,
  dockerRootDir,
  hostname,
  dockerHostOverride,
  dockerContextOverride,
}) => {
  if (!isWsl) return [];

  const mismatches = [];

  if (context !== 'default') {
    mismatches.push(`Docker context is "${context}"; expected "default".`);
  }

  if (endpoint !== 'unix:///var/run/docker.sock') {
    mismatches.push(
      `Docker endpoint is "${endpoint}"; expected "unix:///var/run/docker.sock".`,
    );
  }

  if (daemonName !== undefined && daemonName !== hostname) {
    mismatches.push(
      `Docker daemon is "${daemonName}"; expected native WSL daemon "${hostname}".`,
    );
  }

  if (dockerRootDir !== undefined && dockerRootDir !== '/var/lib/docker') {
    mismatches.push(
      `Docker root is "${dockerRootDir}"; expected "/var/lib/docker".`,
    );
  }

  if (dockerHostOverride !== undefined && dockerHostOverride.length > 0) {
    mismatches.push('DOCKER_HOST overrides the native WSL socket.');
  }

  if (
    dockerContextOverride !== undefined &&
    dockerContextOverride.length > 0 &&
    dockerContextOverride !== 'default'
  ) {
    mismatches.push(
      `DOCKER_CONTEXT is "${dockerContextOverride}"; expected "default".`,
    );
  }

  return mismatches;
};
