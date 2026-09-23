// Frontend-only aliases derived from the tRPC router output.
//
// These used to live in `shared/lib/types.ts`, which made every consumer of the
// shared module — including the server's own routers, jobs and AI tools — pull the
// whole `server/routerTrpc/_app` type graph in. That created a shared → server →
// shared import cycle and made the type graph explode (tsc needed multiple GB).
//
// The aliases are only ever consumed by the frontend, so they live here. Keep
// runtime-free: this module must stay type-only so it is erased by the bundler.
import type { RouterOutput } from "../../../server/routerTrpc/_app";

export type Note = Partial<NonNullable<RouterOutput["notes"]["list"][0]>>;
export type Attachment = NonNullable<Note["attachments"]>[0] & { size: number };
export type Tag = NonNullable<RouterOutput["tags"]["list"][0]>;
export type Config = NonNullable<RouterOutput["config"]["list"]>;
export type LinkInfo = NonNullable<RouterOutput["public"]["linkPreview"]>;
export type ResourceType = NonNullable<RouterOutput["attachments"]["list"]>[0];
export type Comment = NonNullable<RouterOutput["comments"]["list"]>;
export type InstalledPluginInfo = NonNullable<
  RouterOutput["plugin"]["getInstalledPlugins"]
>[0];
export type Conversation = NonNullable<RouterOutput["conversation"]["list"]>[0];
export type Message = NonNullable<RouterOutput["message"]["list"]>[0];
export type PublicUser = NonNullable<RouterOutput["users"]["publicUserList"]>[0];
