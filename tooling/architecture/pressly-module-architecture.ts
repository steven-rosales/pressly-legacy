import { discoverArchitecture } from './architecture-discovery.ts';
import { presslyRepositoryArchitecture } from './pressly-repository.architecture.ts';

export const presslyModuleArchitecture = await discoverArchitecture({
  repository: presslyRepositoryArchitecture,
});
