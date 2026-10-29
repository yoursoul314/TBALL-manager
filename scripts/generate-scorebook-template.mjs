// Standalone, anonymous hand-written form, generated from the app's exact print component.
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createDemoWorkspace } = await server.ssrLoadModule('/src/data/seed.ts');
  const { scorebookHtml } = await server.ssrLoadModule('/src/components/ScorebookPrint.tsx');
  const data = createDemoWorkspace();
  data.players = data.players.map((p) => ({ ...p, name: '선수 __________', number: 0 }));
  data.teams = data.teams.map((t, i) => ({ ...t, name: (i ? '후공' : '선공') + ' 팀 __________' }));
  const game = {
    ...data.games[0],
    id: '수기 양식 · 경기 생성 후 ID 기입: __________',
    name: '경기명 ____________________',
    playedOn: null,
    innings: 5,
  };
  data.games = [game];
  data.events = [];
  await writeFile(
    'public/tb-scorebook-template.html',
    scorebookHtml(data, game, { filled: false, details: true, blankPages: 2 }).replaceAll('#0', '#____'),
    'utf8',
  );
  process.stdout.write('Created anonymous A4 landscape scorebook template (5 pages).\n');
} finally {
  await server.close();
}
