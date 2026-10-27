import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { CDPSession, ElectronApplication, Page } from '@playwright/test';
import { stubMessageBox } from './agent-helpers';
import { createUserDataDir, launchApp } from './launch';
import { createProject, stubOpenDialog } from './workspace-helpers';

/**
 * Renders the README screenshots into docs/images:
 *   KESTREL_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Uses a demo project, a scripted demo agent and a fake model endpoint.
 */
test.skip(process.env['KESTREL_SCREENSHOTS'] !== '1', 'set KESTREL_SCREENSHOTS=1');

const OUT = join(import.meta.dirname, '..', '..', '..', 'docs', 'images');

const FORECAST = `export interface Forecast {
  city: string;
  days: { date: string; high: number; low: number }[];
}

export async function getForecast(city: string, days = 3): Promise<Forecast> {
  const response = await fetch(\`https://api.example.com/forecast?city=\${city}&days=\${days}\`);
  return (await response.json()) as Forecast;
}
`;

const SERVER = `import { createServer } from 'node:http';
import { getForecast } from './forecast';

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const forecast = await getForecast(url.searchParams.get('city') ?? 'Zurich');
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(forecast));
});

server.listen(3000);

`;

const CHAT_ANSWER = `Use a small generic helper that restarts a timer on every call:

\`\`\`ts
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
\`\`\`

- The **last** call wins; earlier calls are dropped.
- 300 ms works well for search fields – tune \`ms\` for your case.`;

/** What "Customize layout with AI" answers for the demo (agent cockpit). */
const LAYOUT_ANSWER = JSON.stringify({
  workbench: {
    sidebarSide: 'right',
    agentSide: 'left',
    panels: { bottom: false },
    statusBar: { hidden: ['cursor', 'completion'] },
  },
  toolbar: ['agent.start', 'git.pull', 'git.push'],
  sidebarView: 'git',
  explanation:
    'Agent panel on the left as the main area, Git on the right, terminal closed, and quick buttons for starting the agent, Pull and Push.',
});

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      resolve(body);
    });
  });
}

/** OpenAI-compatible chat/completions plus the bits of Ollama's API the assistant reads. */
async function startDemoModels(): Promise<{ url: string; close: () => void }> {
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const body = await readBody(request);
    const json = (body: unknown) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (path === '/api/version') {
      json({ version: '0.40.9' });
    } else if (path === '/api/tags') {
      json({ models: [{ name: 'qwen2.5-coder:1.5b' }, { name: 'qwen2.5-coder:7b' }] });
    } else if (path === '/v1/completions') {
      json({
        id: 'c',
        object: 'text_completion',
        created: 0,
        model: 'qwen2.5-coder:1.5b',
        choices: [{ index: 0, text: 'return (celsius * 9) / 5 + 32;', finish_reason: 'stop' }],
      });
    } else if (path === '/v1/chat/completions' && !body.includes('"stream":true')) {
      json({
        id: 'x',
        object: 'chat.completion',
        created: 0,
        model: 'qwen2.5-coder:7b',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: LAYOUT_ANSWER },
            finish_reason: 'stop',
          },
        ],
      });
    } else if (path === '/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const part of CHAT_ANSWER.split(/(?<= )/)) {
        const chunk = {
          id: 'x',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'qwen2.5-coder:7b',
          choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
        };
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      response.end('data: [DONE]\n\n');
    } else {
      response.writeHead(404);
      response.end();
    }
  }
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

let app: ElectronApplication;
let page: Page;
let models: Awaited<ReturnType<typeof startDemoModels>>;

let cdp: CDPSession;

/** Captured through CDP, which keeps the emulated 2x pixel density. */
async function shot(name: string): Promise<void> {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}
const tree = () => page.getByRole('tree', { name: 'Files' });

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  models = await startDemoModels();
  const userDataDir = createUserDataDir();
  writeFileSync(
    join(userDataDir, 'settings.json'),
    JSON.stringify({
      setupDone: true,
      chatModel: { providerId: 'ollama-local', model: 'qwen2.5-coder:7b' },
      completion: {
        enabled: true,
        model: { providerId: 'ollama-local', model: 'qwen2.5-coder:1.5b' },
        fim: 'auto',
        disabledLanguages: ['markdown', 'plaintext'],
      },
    }),
  );
  writeFileSync(
    join(userDataDir, 'providers.json'),
    JSON.stringify([
      {
        id: 'ollama-local',
        name: 'Ollama',
        template: 'ollama',
        baseUrl: `${models.url}/v1`,
        models: ['qwen2.5-coder:7b', 'qwen2.5-coder:1.5b'],
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        template: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['qwen/qwen3-coder:free', 'openai/gpt-oss-20b:free'],
      },
    ]),
  );
  writeFileSync(
    join(userDataDir, 'agents.json'),
    JSON.stringify({
      agents: [
        {
          id: 'demo',
          name: 'Coding agent',
          command: process.execPath,
          args: [join(import.meta.dirname, 'fixtures', 'demo-agent.mjs')],
          env: [],
          reviewChanges: true,
          sandbox: { enabled: false, memoryMb: 2048, cpus: 2 },
        },
      ],
      approved: [],
    }),
  );
  // A readable project name in the title bar and the file tree.
  const root = realpathSync(
    join(
      createProject({
        'weather-api/src/forecast.ts': FORECAST,
        'weather-api/src/server.ts': SERVER,
        'weather-api/src/forecast.test.ts': "import { test } from 'node:test';\n",
        'weather-api/README.md': '# weather-api\n',
        'weather-api/package.json': '{ "name": "weather-api", "private": true }\n',
        'weather-api/tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
        'weather-api/.env': 'WEATHER_API_KEY=secret\n',
      }),
      'weather-api',
    ),
  );
  // A trusted Git repository, so the Git panel has something to show.
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Demo',
        GIT_AUTHOR_EMAIL: 'demo@example.com',
        GIT_COMMITTER_NAME: 'Demo',
        GIT_COMMITTER_EMAIL: 'demo@example.com',
      },
    });
  writeFileSync(join(root, '.gitignore'), '.env\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'Initial weather API');
  writeFileSync(join(userDataDir, 'trust.json'), JSON.stringify({ trusted: [root] }));
  app = await launchApp(userDataDir, { KESTREL_OLLAMA_URL: models.url });
  page = await app.firstWindow();
  // A fixed, sharp (2x) picture size via device emulation: resizing the
  // native window is unreliable on virtual displays (xvfb).
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await stubOpenDialog(app, root);
  await stubMessageBox(app, 1);
  await page.getByRole('button', { name: 'Open folder …' }).first().click();
  await tree().getByRole('treeitem', { name: 'src', exact: true }).click();
  // The empty terminal panel only takes space in the pictures.
  await page.keyboard.press('Control+J');
});

test.afterAll(async () => {
  await app.close();
  models.close();
});

test('agent with plan, tool calls and a permission request', async () => {
  test.setTimeout(120_000);
  await tree().getByRole('treeitem', { name: 'forecast.ts', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Message to the agent' });
  await input.fill('Make getForecast safer: validate the city and the number of days.');
  await input.press('Enter');
  // The edit is held for review; running the tests needs a permission.
  const card = page.getByRole('article', { name: /wants to run a command/ });
  await expect(card).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await shot('agent');

  await card.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByText('All 12 tests passed.')).toBeVisible();
  await page
    .getByRole('region', { name: /to review/ })
    .locator('button', { hasText: 'src/forecast.ts' })
    .click();
  await expect(page.getByRole('tab', { name: 'forecast.ts (Review)' })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot('review');
});

test('built-in chat with the models view', async () => {
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('radio', { name: 'Chat' }).click();
  const input = page.getByRole('textbox', { name: 'Message to the model' });
  await input.fill('How do I debounce a function in TypeScript?');
  await input.press('Enter');
  await expect(page.getByText('The last call wins', { exact: false })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await shot('chat');
});

test('ghost-text autocompletion', async () => {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await tree().getByRole('treeitem', { name: 'server.ts', exact: true }).click();
  const editor = page.getByTestId('monaco-editor');
  await expect(editor).toContainText('server.listen');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('export function toFahrenheit(celsius: number): number {');
  await page.keyboard.press('Enter');
  await expect(editor.locator('[class*="ghost-text"]').first()).toBeVisible();
  await page.waitForTimeout(300);
  await shot('autocomplete');
  // Saved (temporary demo project), so closing the app does not ask.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+S');
});

test('setup assistant with hardware detection', async () => {
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: 'Setup assistant' }).click();
  const wizard = page.getByRole('dialog', { name: 'Set up local models' });
  await wizard.getByRole('button', { name: 'Start' }).click();
  await expect(wizard.getByText('Recommendation', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
  await shot('setup');
  await wizard.getByRole('button', { name: 'Skip assistant' }).click();
});

test('git panel with changes and a commit message', async () => {
  await page.keyboard.press('Control+Shift+G');
  const changes = page.getByRole('region', { name: 'Changes', exact: true });
  await expect(changes.getByRole('button', { name: 'Stage server.ts' })).toBeVisible();
  await changes.getByRole('button', { name: 'Stage server.ts' }).click();
  await page
    .getByRole('textbox', { name: 'Commit message' })
    .fill('Add a Fahrenheit helper to the server');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await shot('git');
});

test('layout proposed by the chat model', async () => {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('layout with AI');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Customize layout with AI' });
  await dialog.getByRole('button', { name: 'Agent cockpit' }).click();
  await dialog.getByRole('button', { name: 'Propose layout' }).click();
  await expect(dialog.getByRole('region', { name: 'Proposed changes' })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await shot('layout-ai');
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});
