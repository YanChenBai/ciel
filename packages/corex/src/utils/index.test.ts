import { describe, expect, expectTypeOf, it } from 'vite-plus/test';

import type { InstallableCielModule } from '../ciel/index.ts';
import { defineInterceptor, type Interceptor } from '../interceptor/index.ts';
import { defineStimulus } from '../stimulus/index.ts';
import { ModuleType } from '../types/index.ts';
import { isModuleType } from './index.ts';

describe('isModuleType', () => {
  it('判断模块类型并收窄联合', () => {
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs calls',
      intercept() {
        return undefined;
      },
    });
    const stimulus = defineStimulus({
      name: 'clock',
      description: 'Emits clock signals',
      setup() {},
    });
    const modules: InstallableCielModule[] = [stimulus, interceptor];
    const interceptors = modules.filter(module => isModuleType(module, ModuleType.Interceptor));

    expect(interceptors).toEqual([interceptor]);
    expectTypeOf(interceptors).toEqualTypeOf<Interceptor[]>();
    expect(isModuleType(stimulus, ModuleType.Interceptor)).toBe(false);
  });
});
