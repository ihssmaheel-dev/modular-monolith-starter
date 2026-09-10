import { Module, Global } from "@nestjs/common";
import { RealtimeConnectionRegistry } from "./connections/realtime-connection.registry";
import { RealtimeService } from "./realtime.service";
import { RealtimeStreamConsumer } from "./streams/realtime-stream.consumer";
import { RealtimeStreamReaper } from "./streams/realtime-stream.reaper";
import { RealtimeStreamRouter } from "./streams/realtime-stream.router";
import { RealtimeSseController } from "./transports/realtime-sse.controller";
import { RealtimeWebsocketGateway } from "./transports/realtime-websocket.gateway";
import { RealtimeAuthListener } from "./listeners/realtime-auth.listener";

@Global()
@Module({
  controllers: [RealtimeSseController],
  providers: [
    RealtimeConnectionRegistry,
    RealtimeStreamConsumer,
    RealtimeStreamReaper,
    RealtimeStreamRouter,
    RealtimeWebsocketGateway,
    RealtimeAuthListener,
    RealtimeService,
  ],
  exports: [RealtimeService],
})
export class RealtimeModule {}
