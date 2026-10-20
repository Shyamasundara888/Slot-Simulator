import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ModuleError } from "../module/build.js";
import { readModuleDir } from "../module/load.js";
import { parseSlotModule, type SlotModule } from "../module/parse.js";
import { decodeModuleFiles, unpackModuleZip, writeModuleZip } from "../module/zip.js";
import { ScriptError, ScriptRuntime } from "../script/runtime.js";

const USAGE = `Uso: npm run mod -- <comando> ...

  install <file.zip> [--slots DIR] [--force]
      controlla il mod e lo estrae in slots/<id>/ (con --force sostituisce un modulo esistente)
  pack <cartella-modulo> [--out DIR]
      controlla il modulo e crea mods/<id>-<versione>.zip, pronto da condividere
  check <cartella-modulo | file.zip>
      controlla il modulo senza installarlo`;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Controlla un modulo come farebbe il motore, script compreso. */
async function validate(raw: Record<string, Uint8Array>): Promise<SlotModule> {
  const module = parseSlotModule(decodeModuleFiles(raw));
  if (module.script !== null) await ScriptRuntime.create(module.math, module.script);
  return module;
}

const describe = ({ manifest, math, script }: SlotModule) =>
  `${manifest.name} ${manifest.version} (${manifest.id}): ${math.reelCount}x${math.rows}, ${math.lines.length} linee` +
  (script === null ? "" : ", con script");

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      slots: { type: "string", default: "slots" },
      out: { type: "string", default: "mods" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, target] = positionals;
  if (values.help || command === undefined || target === undefined) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  const readRaw = async (path: string) => (path.endsWith(".zip") ? unpackModuleZip(await readFile(path)) : readModuleDir(path));

  switch (command) {
    case "check": {
      const module = await validate(await readRaw(resolve(target)));
      console.log(`OK: ${describe(module)}`);
      return;
    }
    case "install": {
      const raw = unpackModuleZip(await readFile(resolve(target)));
      const module = await validate(raw);
      const dir = join(resolve(values.slots), module.manifest.id);
      if (await exists(dir)) {
        if (!values.force) throw new ModuleError([`${dir} esiste già: usa --force per sostituirlo`]);
        await rm(dir, { recursive: true });
      }
      for (const [file, bytes] of Object.entries(raw)) {
        await mkdir(dirname(join(dir, file)), { recursive: true });
        await writeFile(join(dir, file), bytes);
      }
      console.log(`Installato in ${dir}: ${describe(module)}`);
      return;
    }
    case "pack": {
      const raw = await readModuleDir(resolve(target));
      const module = await validate(raw);
      const out = resolve(values.out);
      await mkdir(out, { recursive: true });
      const file = join(out, `${module.manifest.id}-${module.manifest.version}.zip`);
      await writeFile(file, writeModuleZip(raw));
      console.log(`Creato ${file}: ${describe(module)}`);
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof ModuleError || err instanceof ScriptError ? err.message : err);
  process.exitCode = 1;
});
