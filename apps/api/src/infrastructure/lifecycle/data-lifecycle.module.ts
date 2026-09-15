import { Global, Module } from "@nestjs/common";

import { DataLifecycleRegistry } from "./data-lifecycle.registry";

@Global()
@Module({ providers: [DataLifecycleRegistry], exports: [DataLifecycleRegistry] })
export class DataLifecycleModule {}
