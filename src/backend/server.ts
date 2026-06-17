import { createApp } from "./app.js";

function parseArgs(argv: string[]) {
  let host = "127.0.0.1";
  let port = 8765;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--host" && argv[index + 1]) {
      host = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--port" && argv[index + 1]) {
      port = Number.parseInt(argv[index + 1], 10);
      index += 1;
    }
  }
  return { host, port };
}

const { host, port } = parseArgs(process.argv.slice(2));

createApp().listen(port, host, () => {
  console.log(`Study Route 管理台已启动：http://${host}:${port}`);
  console.log("按 Ctrl+C 停止服务。");
});
