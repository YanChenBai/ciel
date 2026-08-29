import type { Interceptor as BaseInterceptor } from '@ciels/interceptor';

import type { CielModule } from '#modules/types.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface DefineInterceptorOptions extends BaseInterceptor, CielMetadata {}

export interface Interceptor extends DefineInterceptorOptions, CielModule<'interceptor'> {}
