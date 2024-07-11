import { manifest } from "MANIFEST";
import { Server } from "SERVER";
import { serve } from "bun";

const svelte = new Server(manifest);
// @ts-expect-error idk
await svelte.init({ env: process.env });

serve({
  fetch(req, server) {
    const { pathname } = new URL(req.url);
    // assets

    return svelte.respond(req, {
      getClientAddress() {
        return server.requestIP(req)?.address ?? "";
      },
    });
  },
});
