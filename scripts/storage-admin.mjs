import { runStorageAdmin } from "./storage-admin-main.mjs";

process.exitCode = await runStorageAdmin(process.argv.slice(2), {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});
