# Privacy

Kestrel has no telemetry, no analytics and no account. It does not collect,
store or sell any data about you, and it has no server of its own.

The app only connects to other systems in these cases:

| When                                                    | Where                                                                                | What is sent                                                  | How to turn it off                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| On start (installed app only): check for a new version  | GitHub (`github.com`, `objects.githubusercontent.com`)                               | A normal download request for the release feed (`latest.yml`) | Command palette → _Turn off automatic update check_                              |
| You click _Update catalog_ in the setup assistant       | GitHub (`raw.githubusercontent.com`)                                                 | A normal download request for the catalog file                | Do not click it; the catalog shipped with the app is used                        |
| You install Ollama in the setup assistant               | GitHub (`api.github.com`, `github.com`, release asset hosts)                         | Download requests for the official Ollama release             | Do not start the installation                                                    |
| You use the chat, autocompletion or a model provider    | The address you configured (e.g. OpenRouter, OpenAI, your local Ollama or llama.cpp) | Your messages, attached files, or the code around the cursor  | Remove the provider; autocompletion can be switched off per language or entirely |
| You start an agent (Claude Code, Gemini CLI, …)         | Whatever the agent itself contacts (its own vendor; `npx` downloads it from npm)     | Decided by the agent and its vendor, not by Kestrel           | Do not start the agent                                                           |
| You connect an MCP server                               | The server you configured                                                            | Tool calls you or an agent make                               | Disable or remove the server                                                     |
| You open a page in the integrated browser               | The website                                                                          | What any browser sends                                        | Do not open pages                                                                |
| You pull images or start containers in the Docker panel | Your Docker daemon and its registries                                                | Decided by Docker                                             | Do not use the Docker features                                                   |

Secret files (`.env`, keys, `.ssh`, …) are never sent to models or agents.
API keys stay in your system keychain and are only sent to the provider they
belong to.

The data of the services above is handled under their own privacy policies.
Kestrel keeps your settings, chats, checkpoints and logs only on your computer
(in the app data folder); uninstalling leaves them there so you can delete
them yourself.

Questions: open an issue at
<https://github.com/IlianBurri/Kestrel-Agen-Harness-IDE/issues>.
