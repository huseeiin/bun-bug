
import {basename, parse, relative, resolve} from "node:path";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

function adapter(opts = {}) {
  const { out = "build", compress = false } = opts;
  return {
    name: "svelte-adapter-bun",
    async adapt(builder) {
      const tmp = builder.getBuildDirectory("adapter-bun");
      builder.rimraf(out);
      builder.rimraf(tmp);
      builder.mkdirp(tmp);
      builder.log.minor("Copying assets");
      const clientPath = `${out}/client${builder.config.kit.paths.base}`;
      const prerenderedPath = `${out}/prerendered${builder.config.kit.paths.base}`;
      builder.writeClient(clientPath);
      builder.writePrerendered(prerenderedPath);
      let serverPath = resolve(import.meta.dirname, "src/index.ts");
      let server = await Bun.file(serverPath).text();
      if (compress === "brotli") {
        server = 'import {brotliCompressSync} from "node:zlib";' + server;
      }
      let assets = Array.from(new Bun.Glob("**/*").scanSync({ cwd: clientPath, absolute: true }));
      let prerendered;
      try {
        prerendered = Array.from(new Bun.Glob("**/*").scanSync({
          cwd: prerenderedPath,
          absolute: true
        }));
        assets = prerendered.concat(assets);
      } catch {
      }
      const mappedAssets = assets.map((asset, index) => {
        const mime = Bun.file(asset).type;
        const shouldCompress = compress && mime.startsWith("text");
        return `const asset_${index} = new Response(${shouldCompress ? compress === "brotli" ? "brotliCompressSync" : "Bun.gzipSync" : ""}(${shouldCompress ? "await " : ""}Bun.file(${JSON.stringify(asset)})${shouldCompress ? `.bytes()${shouldCompress ? ")" : ""}` : ")"}, {headers: {${shouldCompress ? `"Content-Encoding": "${compress == "brotli" ? "br" : "gzip"}",` : ""}"Content-Type": ${JSON.stringify(mime)}}});`;
      }).join(";");
      server = mappedAssets + server.replace("// assets", assets.map((asset, index) => {
        const isPrerendered = prerendered && prerendered.includes(asset);
        return `if (${basename(asset) === "index.html" && isPrerendered ? 'pathname === "/" ||' : ""} pathname === ${JSON.stringify(`/${relative(resolve(out, isPrerendered ? "prerendered" : "client"), asset)}`)} ${isPrerendered ? `|| pathname === ${JSON.stringify(`/${parse(relative(resolve(out, "prerendered"), asset)).name}`)}` : ""}) { return asset_${index}.clone() };`;
      }).join(";"));
      builder.log.minor("Building server");
      builder.writeServer(tmp);
      serverPath = resolve(tmp, "server");
      await Bun.write(resolve(serverPath, "index.ts"), server);
      await Bun.write(`${tmp}/manifest.js`, [
        `export const manifest = ${builder.generateManifest({
          relativePath: "./"
        })};`,
        `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
        `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`
      ].join("\n\n"));
      const pkg = await Bun.file("package.json").json();
      // if you use bun, it will not work
      await Bun.build({
        entrypoints: [`${tmp}/index.js`, `${tmp}/manifest.js`],
        sourcemap: "linked",
        outdir: `${out}/server`
      });
       // if you use rollup, its going to work

      // const bundle = await rollup({
      //   input: {
      //     index: `${tmp}/index.js`,
      //     manifest: `${tmp}/manifest.js`,
      //   },
      //   external:
      //     // dependencies could have deep exports, so we need a regex
      //     Object.keys(pkg.dependencies || {}).map(
      //       (d) => new RegExp(`^${d}(\\/.*)?$`)
      //     ),
      //   plugins: [
      //     nodeResolve({
      //       preferBuiltins: true,
      //       exportConditions: ["node"],
      //     }),
      //     // @ts-expect-error idk
      //     commonjs({ strictRequires: true }),
      //     json(),
      //   ],
      // });

      // await bundle.write({
      //   dir: `${out}/server`,
      //   format: "esm",
      //   sourcemap: true,
      //   chunkFileNames: "chunks/[name]-[hash].js",
      // });

      builder.copy(serverPath, out, {
        replace: {
          MANIFEST: "./server/manifest.js",
          SERVER: "./server/index.js"
        }
      });
    },
    supports: {
      read: () => true
    }
  };
}
export {
  adapter as default
};
